import { prisma } from '../lib/prisma.js';
import type { CorporateCalendarEvent } from '@prisma/client';
import { getCorporateCalendarLastSyncedAt } from './corporate-calendar-sync.js';

export type CalendarEventDto = {
  id: string;
  symbol: string;
  eventDate: string;
  kind: string;
  dividendSubKind: string | null;
  titleAr: string;
  titleEn: string;
  agendaAr: string | null;
  agendaEn: string | null;
  hostNameAr: string | null;
  hostNameEn: string | null;
  placeAr: string | null;
  placeEn: string | null;
  eventTime: string | null;
  displayNameAr: string | null;
  displayNameEn: string | null;
};

export type CalendarDayDto = {
  date: string;
  events: CalendarEventDto[];
};

function toDateOnlyUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function cairoTodayUtc(): Date {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [y, m, day] = fmt.format(new Date()).split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, day!));
}

function addDaysUtc(d: Date, days: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

function mapRow(
  row: CorporateCalendarEvent & {
    instrument: { displayNameAr: string; displayNameEn: string } | null;
  },
): CalendarEventDto {
  return {
    id: row.id,
    symbol: row.symbol,
    eventDate: toDateOnlyUtc(row.eventDate),
    kind: row.kind,
    dividendSubKind: row.dividendSubKind,
    titleAr: row.titleAr,
    titleEn: row.titleEn,
    agendaAr: row.agendaAr,
    agendaEn: row.agendaEn,
    hostNameAr: row.hostNameAr,
    hostNameEn: row.hostNameEn,
    placeAr: row.placeAr,
    placeEn: row.placeEn,
    eventTime: row.eventTime,
    displayNameAr: row.instrument?.displayNameAr ?? row.hostNameAr,
    displayNameEn: row.instrument?.displayNameEn ?? row.hostNameEn,
  };
}

const eventInclude = {
  instrument: { select: { displayNameAr: true, displayNameEn: true } },
} as const;

export function defaultCalendarRange(): { from: Date; to: Date } {
  const from = cairoTodayUtc();
  return { from, to: addDaysUtc(from, 90) };
}

export async function listCorporateCalendarDates(
  horizonDays: number,
): Promise<{ dates: string[]; fetchedAt: string | null }> {
  const from = cairoTodayUtc();
  const to = addDaysUtc(from, horizonDays);
  const fetchedAt = await getCorporateCalendarLastSyncedAt();

  const rows = await prisma.corporateCalendarEvent.findMany({
    where: {
      eventDate: { gte: from, lte: to },
      instrumentId: { not: null },
    },
    select: { eventDate: true },
    distinct: ['eventDate'],
    orderBy: { eventDate: 'asc' },
  });

  return {
    dates: rows.map((r) => toDateOnlyUtc(r.eventDate)),
    fetchedAt: fetchedAt?.toISOString() ?? null,
  };
}

export async function listCorporateCalendarByDays(
  from: Date,
  to: Date,
): Promise<{ days: CalendarDayDto[]; fetchedAt: string | null }> {
  const fetchedAt = await getCorporateCalendarLastSyncedAt();

  const rows = await prisma.corporateCalendarEvent.findMany({
    where: {
      eventDate: { gte: from, lte: to },
      instrumentId: { not: null },
    },
    include: eventInclude,
    orderBy: [{ eventDate: 'asc' }, { symbol: 'asc' }],
  });

  const byDate = new Map<string, CalendarEventDto[]>();
  for (const row of rows) {
    const key = toDateOnlyUtc(row.eventDate);
    const list = byDate.get(key) ?? [];
    list.push(mapRow(row));
    byDate.set(key, list);
  }

  const days: CalendarDayDto[] = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, events]) => ({ date, events }));

  return { days, fetchedAt: fetchedAt?.toISOString() ?? null };
}

export async function listCorporateCalendarForSymbol(
  symbol: string,
  from: Date,
  to: Date,
  limit = 5,
): Promise<{ events: CalendarEventDto[]; fetchedAt: string | null }> {
  const norm = symbol.trim().toUpperCase();
  const fetchedAt = await getCorporateCalendarLastSyncedAt();

  const rows = await prisma.corporateCalendarEvent.findMany({
    where: {
      symbol: norm,
      eventDate: { gte: from, lte: to },
      instrumentId: { not: null },
    },
    include: eventInclude,
    orderBy: { eventDate: 'asc' },
    take: limit,
  });

  return {
    events: rows.map(mapRow),
    fetchedAt: fetchedAt?.toISOString() ?? null,
  };
}

export function parseCalendarDateParam(raw: string | undefined, fallback: Date): Date {
  if (!raw) return fallback;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!m) return fallback;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return fallback;
  return new Date(Date.UTC(y, mo - 1, d));
}
