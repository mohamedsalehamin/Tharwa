import { InstrumentKind, type Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { fetchMubasherEgxCorporateCalendar } from './connectors/mubasher-amr.js';

const SOURCE = 'mubasher';

export type CorporateCalendarSyncResult = {
  success: boolean;
  eventsUpserted: number;
  attemptCount: number;
  errorMessage?: string;
};

/** Upsert Mubasher rows for consumer-visible EGX equities only. */
export async function syncCorporateCalendarFromMubasher(
  maxAttempts = 3,
  signal?: AbortSignal,
): Promise<CorporateCalendarSyncResult> {
  let lastError: string | undefined;
  let attemptCount = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    attemptCount = attempt;
    try {
      const normalized = await fetchMubasherEgxCorporateCalendar(signal);
      const visible = await prisma.instrument.findMany({
        where: { kind: InstrumentKind.equity, isConsumerVisible: true },
        select: { id: true, code: true },
      });
      const codeToId = new Map(visible.map((i) => [i.code.toUpperCase(), i.id]));
      const allowed = new Set(codeToId.keys());

      const filtered = normalized.filter((r) => allowed.has(r.symbol.toUpperCase()));
      const syncedAt = new Date();

      await prisma.$transaction(async (tx) => {
        await tx.corporateCalendarEvent.deleteMany({ where: { source: SOURCE } });

        if (filtered.length > 0) {
          await tx.corporateCalendarEvent.createMany({
            data: filtered.map((r) => ({
              source: SOURCE,
              sourceKey: r.sourceKey,
              symbol: r.symbol.toUpperCase(),
              instrumentId: codeToId.get(r.symbol.toUpperCase()) ?? null,
              eventDate: r.eventDate,
              eventDateEnd: r.eventDateEnd,
              kind: r.kind,
              dividendSubKind: r.dividendSubKind,
              titleAr: r.titleAr,
              titleEn: r.titleEn,
              agendaAr: r.agendaAr,
              agendaEn: r.agendaEn,
              hostNameAr: r.hostNameAr,
              hostNameEn: r.hostNameEn,
              placeAr: r.placeAr,
              placeEn: r.placeEn,
              eventTime: r.eventTime,
              raw: r.raw as Prisma.InputJsonValue,
              syncedAt,
            })),
          });
        }
      });

      await prisma.corporateCalendarSyncRun.create({
        data: {
          success: true,
          eventsUpserted: filtered.length,
          attemptCount,
        },
      });

      return { success: true, eventsUpserted: filtered.length, attemptCount };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
  }

  await prisma.corporateCalendarSyncRun.create({
    data: {
      success: false,
      eventsUpserted: 0,
      attemptCount,
      errorMessage: lastError,
    },
  });

  return {
    success: false,
    eventsUpserted: 0,
    attemptCount,
    errorMessage: lastError,
  };
}

/** Latest successful sync timestamp (for API `fetchedAt`). */
export async function getCorporateCalendarLastSyncedAt(): Promise<Date | null> {
  const run = await prisma.corporateCalendarSyncRun.findFirst({
    where: { success: true },
    orderBy: { finishedAt: 'desc' },
    select: { finishedAt: true },
  });
  return run?.finishedAt ?? null;
}
