import { EgxHolidaySource, type EgxMarketHoliday } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import {
  fetchCalendarLabsEgxHolidays,
  type CalendarLabsEgxHolidayRow,
} from './connectors/calendarlabs-egx-holidays.js';

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const CACHE_TTL_MS = 60_000;

let cachedHolidayDates: string[] | null = null;
let cacheLoadedAt = 0;

export type EgxHolidayAdminItem = {
  id: string;
  holidayDate: string;
  nameEn: string;
  nameAr: string | null;
  source: EgxHolidaySource;
  createdAt: string;
  updatedAt: string;
};

export type EgxHolidaySyncRunItem = {
  id: string;
  success: boolean;
  years: number[];
  holidaysUpserted: number;
  errorMessage: string | null;
  finishedAt: string;
};

function toDateOnlyUtc(dateKey: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

function toAdmin(row: EgxMarketHoliday): EgxHolidayAdminItem {
  return {
    id: row.id,
    holidayDate: row.holidayDate.toISOString().slice(0, 10),
    nameEn: row.nameEn,
    nameAr: row.nameAr,
    source: row.source,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function parseHolidayDateKey(raw: string): string {
  const trimmed = raw.trim();
  if (!DATE_KEY_RE.test(trimmed)) {
    throw new Error('holidayDate must be YYYY-MM-DD');
  }
  const d = toDateOnlyUtc(trimmed);
  if (Number.isNaN(d.getTime())) {
    throw new Error('holidayDate is invalid');
  }
  return trimmed;
}

export function cairoCalendarYear(now: Date = new Date()): number {
  const y = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
  }).format(now);
  return Number(y);
}

export async function listEgxHolidayDateKeys(): Promise<string[]> {
  const rows = await prisma.egxMarketHoliday.findMany({
    select: { holidayDate: true },
    orderBy: { holidayDate: 'asc' },
  });
  return rows.map((r) => r.holidayDate.toISOString().slice(0, 10));
}

export function invalidateEgxHolidayCache(): void {
  cachedHolidayDates = null;
  cacheLoadedAt = 0;
}

export async function getEgxHolidayDateKeysCached(): Promise<Set<string>> {
  if (cachedHolidayDates && Date.now() - cacheLoadedAt < CACHE_TTL_MS) {
    return new Set(cachedHolidayDates);
  }
  cachedHolidayDates = await listEgxHolidayDateKeys();
  cacheLoadedAt = Date.now();
  return new Set(cachedHolidayDates);
}

/** Test helper — inject holiday dates without DB. */
export function setEgxHolidayCacheForTests(dates: string[]): void {
  cachedHolidayDates = [...dates];
  cacheLoadedAt = Date.now();
}

export async function listEgxHolidaysAdmin(input?: {
  year?: number;
}): Promise<EgxHolidayAdminItem[]> {
  const where =
    input?.year != null
      ? {
          holidayDate: {
            gte: new Date(Date.UTC(input.year, 0, 1)),
            lte: new Date(Date.UTC(input.year, 11, 31)),
          },
        }
      : undefined;

  const rows = await prisma.egxMarketHoliday.findMany({
    where,
    orderBy: [{ holidayDate: 'asc' }, { source: 'asc' }],
  });
  return rows.map(toAdmin);
}

export async function getLatestEgxHolidaySyncRun(): Promise<EgxHolidaySyncRunItem | null> {
  const row = await prisma.egxHolidaySyncRun.findFirst({
    orderBy: { finishedAt: 'desc' },
  });
  if (!row) return null;
  return {
    id: row.id,
    success: row.success,
    years: row.years,
    holidaysUpserted: row.holidaysUpserted,
    errorMessage: row.errorMessage,
    finishedAt: row.finishedAt.toISOString(),
  };
}

export type CreateAdminEgxHolidayInput = {
  holidayDate: string;
  nameEn: string;
  nameAr?: string | null;
  createdByAdminId?: string;
};

export async function createAdminEgxHoliday(
  input: CreateAdminEgxHolidayInput,
): Promise<EgxHolidayAdminItem> {
  const holidayDate = parseHolidayDateKey(input.holidayDate);
  const existing = await prisma.egxMarketHoliday.findUnique({
    where: { holidayDate: toDateOnlyUtc(holidayDate) },
  });
  if (existing) {
    throw new Error('A holiday already exists on this date');
  }

  const row = await prisma.egxMarketHoliday.create({
    data: {
      holidayDate: toDateOnlyUtc(holidayDate),
      nameEn: input.nameEn.trim(),
      nameAr: input.nameAr?.trim() || null,
      source: EgxHolidaySource.admin,
      createdByAdminId: input.createdByAdminId ?? null,
    },
  });
  invalidateEgxHolidayCache();
  return toAdmin(row);
}

export async function deleteEgxHoliday(id: string): Promise<boolean> {
  const res = await prisma.egxMarketHoliday.deleteMany({ where: { id } });
  if (res.count > 0) {
    invalidateEgxHolidayCache();
  }
  return res.count > 0;
}

function yearBounds(year: number): { from: Date; to: Date } {
  return {
    from: new Date(Date.UTC(year, 0, 1)),
    to: new Date(Date.UTC(year, 11, 31)),
  };
}

async function upsertCalendarLabsYear(
  year: number,
  rows: CalendarLabsEgxHolidayRow[],
): Promise<number> {
  const { from, to } = yearBounds(year);

  await prisma.$transaction(async (tx) => {
    const adminRows = await tx.egxMarketHoliday.findMany({
      where: {
        source: EgxHolidaySource.admin,
        holidayDate: { gte: from, lte: to },
      },
      select: { holidayDate: true },
    });

    await tx.egxMarketHoliday.deleteMany({
      where: {
        source: EgxHolidaySource.calendarlabs,
        holidayDate: { gte: from, lte: to },
      },
    });

    const toCreate = rows.filter((r) => !adminRows.some(
      (a) => a.holidayDate.toISOString().slice(0, 10) === r.dateKey,
    ));

    if (toCreate.length > 0) {
      await tx.egxMarketHoliday.createMany({
        data: toCreate.map((r) => ({
          holidayDate: toDateOnlyUtc(r.dateKey),
          nameEn: r.nameEn,
          source: EgxHolidaySource.calendarlabs,
        })),
      });
    }
  });

  return rows.length;
}

export type SyncEgxHolidaysResult = {
  success: boolean;
  years: number[];
  holidaysUpserted: number;
  errorMessage?: string;
};

export async function syncEgxHolidaysFromCalendarLabs(
  years?: number[],
  signal?: AbortSignal,
): Promise<SyncEgxHolidaysResult> {
  const cairoYear = cairoCalendarYear();
  const targetYears = years?.length
    ? [...new Set(years)].sort((a, b) => a - b)
    : [cairoYear, cairoYear + 1];

  let holidaysUpserted = 0;

  try {
    for (const year of targetYears) {
      const rows = await fetchCalendarLabsEgxHolidays(year, signal);
      holidaysUpserted += await upsertCalendarLabsYear(year, rows);
    }

    await prisma.egxHolidaySyncRun.create({
      data: {
        success: true,
        years: targetYears,
        holidaysUpserted,
      },
    });
    invalidateEgxHolidayCache();

    return { success: true, years: targetYears, holidaysUpserted };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    await prisma.egxHolidaySyncRun.create({
      data: {
        success: false,
        years: targetYears,
        holidaysUpserted,
        errorMessage,
      },
    });
    throw e;
  }
}
