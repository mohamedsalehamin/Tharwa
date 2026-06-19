import { Prisma, QuoteCategory, SessionState } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import type { Redis } from 'ioredis';
import type { Env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import {
  ALL_METAL_QUOTE_INSTRUMENT_CODES,
  instrumentCodeSortIndex,
  metalItemToInstrumentCode,
  type MetalQuoteInstrumentCode,
} from '../lib/metal-instrument-codes.js';
import { fetchMetals, isBuiltInMetalsPlaceholder, type MetalItem } from './connectors/metals.js';
import { getEgyptTelegramBundleCached } from './egypt-telegram-bundle.js';

type InstrumentIdMap = Map<MetalQuoteInstrumentCode, string>;

let instrumentIdMapCache: InstrumentIdMap | null = null;

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function decimalToNumber(value: Prisma.Decimal | null | undefined): number | null {
  if (value == null) return null;
  const n = value.toNumber();
  return Number.isFinite(n) ? n : null;
}

export async function loadMetalInstrumentIdMap(): Promise<InstrumentIdMap> {
  if (instrumentIdMapCache) return instrumentIdMapCache;

  const rows = await prisma.instrument.findMany({
    where: { code: { in: [...ALL_METAL_QUOTE_INSTRUMENT_CODES] } },
    select: { id: true, code: true },
  });

  const map = new Map<MetalQuoteInstrumentCode, string>();
  for (const row of rows) {
    if (ALL_METAL_QUOTE_INSTRUMENT_CODES.includes(row.code as MetalQuoteInstrumentCode)) {
      map.set(row.code as MetalQuoteInstrumentCode, row.id);
    }
  }
  instrumentIdMapCache = map;
  return map;
}

/** Test helper — bust in-memory instrument id cache after seeding. */
export function resetMetalInstrumentIdMapCache(): void {
  instrumentIdMapCache = null;
}

type LatestSnapshotRow = {
  instrumentId: string;
  asOf: Date;
  last: Prisma.Decimal | null;
  quoteCategory: QuoteCategory;
  sessionState: SessionState;
  raw: Prisma.JsonValue | null;
};

async function loadLatestSnapshotsByInstrument(): Promise<Map<string, LatestSnapshotRow>> {
  const idMap = await loadMetalInstrumentIdMap();
  const instrumentIds = [...idMap.values()];
  if (instrumentIds.length === 0) return new Map();

  const rows = await prisma.$queryRaw<LatestSnapshotRow[]>`
    SELECT DISTINCT ON (instrument_id)
      instrument_id AS "instrumentId",
      as_of AS "asOf",
      last,
      quote_category AS "quoteCategory",
      session_state AS "sessionState",
      raw
    FROM quote_snapshots
    WHERE instrument_id IN (${Prisma.join(instrumentIds)})
    ORDER BY instrument_id, as_of DESC
  `;

  return new Map(rows.map((row) => [row.instrumentId, row]));
}

function snapshotRowToMetalItem(code: MetalQuoteInstrumentCode, row: LatestSnapshotRow): MetalItem | null {
  const price = decimalToNumber(row.last);
  if (price == null) return null;

  const base = {
    asOf: row.asOf.toISOString(),
    quoteCategory: row.quoteCategory,
    sessionState: row.sessionState,
    isStale: false,
    amountEgp: round4(price),
  };

  switch (code) {
    case 'GOLD_24K_GRAM_EGP':
      return { ...base, metal: 'gold', unit: 'gram', karat: 24 };
    case 'GOLD_21K_GRAM_EGP':
      return { ...base, metal: 'gold', unit: 'gram', karat: 21 };
    case 'GOLD_18K_GRAM_EGP':
      return { ...base, metal: 'gold', unit: 'gram', karat: 18 };
    case 'GOLD_POUND_EGP':
      return { ...base, metal: 'gold', unit: 'gold_pound', karat: 21 };
    case 'GOLD_TROY_OZ_EGP':
      return { ...base, metal: 'gold', unit: 'troy_ounce', karat: null };
    case 'SILVER_EGP':
      return { ...base, metal: 'silver', unit: 'gram', karat: null };
    default:
      return null;
  }
}

export async function getLatestMetalQuotesFromDb(): Promise<{
  items: MetalItem[];
  bundleFetchedAt: string;
} | null> {
  const idMap = await loadMetalInstrumentIdMap();
  if (idMap.size < ALL_METAL_QUOTE_INSTRUMENT_CODES.length) return null;

  const latestByInstrument = await loadLatestSnapshotsByInstrument();
  const items: MetalItem[] = [];
  let bundleFetchedAt: Date | null = null;

  for (const code of ALL_METAL_QUOTE_INSTRUMENT_CODES) {
    const instrumentId = idMap.get(code);
    if (!instrumentId) return null;
    const row = latestByInstrument.get(instrumentId);
    if (!row) return null;
    const item = snapshotRowToMetalItem(code, row);
    if (!item) return null;
    items.push(item);
    if (!bundleFetchedAt || row.asOf > bundleFetchedAt) {
      bundleFetchedAt = row.asOf;
    }
  }

  items.sort(
    (a, b) =>
      instrumentCodeSortIndex(metalItemToInstrumentCode(a) ?? '') -
      instrumentCodeSortIndex(metalItemToInstrumentCode(b) ?? ''),
  );

  return {
    items,
    bundleFetchedAt: bundleFetchedAt!.toISOString(),
  };
}

function itemsMatchLatest(
  items: MetalItem[],
  latestByInstrument: Map<string, LatestSnapshotRow>,
  idMap: InstrumentIdMap,
): boolean {
  for (const item of items) {
    const code = metalItemToInstrumentCode(item);
    if (!code) continue;
    const instrumentId = idMap.get(code);
    if (!instrumentId) return false;
    const latest = latestByInstrument.get(instrumentId);
    if (!latest) return false;
    const prev = decimalToNumber(latest.last);
    if (prev == null || round4(prev) !== round4(item.amountEgp)) return false;
  }
  return true;
}

function youngestSnapshotAgeSec(latestByInstrument: Map<string, LatestSnapshotRow>): number | null {
  let youngest: Date | null = null;
  for (const row of latestByInstrument.values()) {
    if (!youngest || row.asOf > youngest) youngest = row.asOf;
  }
  if (!youngest) return null;
  return (Date.now() - youngest.getTime()) / 1000;
}

export async function persistMetalQuoteSnapshots(
  items: MetalItem[],
  opts?: { source?: string; dedupMinIntervalSec?: number },
): Promise<{ inserted: number; skipped: boolean }> {
  const idMap = await loadMetalInstrumentIdMap();
  if (idMap.size === 0) return { inserted: 0, skipped: true };

  const dedupMinIntervalSec = opts?.dedupMinIntervalSec ?? 300;
  const latestByInstrument = await loadLatestSnapshotsByInstrument();

  if (itemsMatchLatest(items, latestByInstrument, idMap)) {
    const ageSec = youngestSnapshotAgeSec(latestByInstrument);
    if (ageSec != null && ageSec < dedupMinIntervalSec) {
      return { inserted: 0, skipped: true };
    }
  }

  const source = opts?.source ?? 'telegram';
  let inserted = 0;

  for (const item of items) {
    const code = metalItemToInstrumentCode(item);
    if (!code) continue;
    const instrumentId = idMap.get(code);
    if (!instrumentId) continue;

    await prisma.quoteSnapshot.create({
      data: {
        instrumentId,
        asOf: new Date(item.asOf),
        last: new Prisma.Decimal(item.amountEgp),
        quoteCategory: item.quoteCategory,
        sessionState: item.sessionState,
        raw: {
          source,
          metal: item.metal,
          unit: item.unit,
          karat: item.karat,
        },
      },
    });
    inserted += 1;
  }

  return { inserted, skipped: false };
}

export async function hasHistoricalMetalMessageSnapshots(
  telegramMessageId: number,
): Promise<boolean> {
  const existing = await prisma.quoteSnapshot.findFirst({
    where: {
      raw: {
        path: ['telegramMessageId'],
        equals: telegramMessageId,
      },
    },
    select: { id: true },
  });
  return existing != null;
}

/** Backfill path — dedupe by Telegram message id, keep channel post timestamp as `asOf`. */
export async function persistHistoricalMetalQuoteSnapshots(
  items: MetalItem[],
  opts: { telegramMessageId: number; source?: string },
): Promise<{ inserted: number; skipped: boolean }> {
  if (await hasHistoricalMetalMessageSnapshots(opts.telegramMessageId)) {
    return { inserted: 0, skipped: true };
  }

  const idMap = await loadMetalInstrumentIdMap();
  if (idMap.size === 0) return { inserted: 0, skipped: true };

  const source = opts.source ?? 'telegram_history';
  let inserted = 0;

  for (const item of items) {
    const code = metalItemToInstrumentCode(item);
    if (!code) continue;
    const instrumentId = idMap.get(code);
    if (!instrumentId) continue;

    await prisma.quoteSnapshot.create({
      data: {
        instrumentId,
        asOf: new Date(item.asOf),
        last: new Prisma.Decimal(item.amountEgp),
        quoteCategory: item.quoteCategory,
        sessionState: item.sessionState,
        raw: {
          source,
          telegramMessageId: opts.telegramMessageId,
          metal: item.metal,
          unit: item.unit,
          karat: item.karat,
        },
      },
    });
    inserted += 1;
  }

  return { inserted, skipped: false };
}

export async function fetchLiveMetalItems(
  env: Env,
  redis: Redis,
  log: FastifyBaseLogger,
): Promise<{ items: MetalItem[]; fetchedAt: Date }> {
  const tgBundle = await getEgyptTelegramBundleCached(env, redis, log);
  return fetchMetals(env, undefined, undefined, log, tgBundle);
}

export async function ingestMetalQuotesFromUpstream(
  env: Env,
  redis: Redis,
  log: FastifyBaseLogger,
): Promise<{ ok: boolean; inserted: number; skipped: boolean; reason?: string }> {
  if (!env.METALS_SNAPSHOT_ENABLED) {
    return { ok: false, inserted: 0, skipped: true, reason: 'disabled' };
  }

  try {
    const { items, fetchedAt } = await fetchLiveMetalItems(env, redis, log);
    if (isBuiltInMetalsPlaceholder(items)) {
      log.warn('metal snapshot ingest: skipping placeholder prices');
      return { ok: false, inserted: 0, skipped: true, reason: 'placeholder' };
    }

    const source = env.METALS_MOCK_JSON ? 'mock' : 'telegram';
    const { inserted, skipped } = await persistMetalQuoteSnapshots(items, {
      source,
      dedupMinIntervalSec: env.METALS_SNAPSHOT_INTERVAL_SEC,
    });

    if (inserted > 0) {
      await redis.del('cache:metals:v1').catch(() => undefined);
      log.info({ inserted, fetchedAt: fetchedAt.toISOString(), source }, 'metal snapshot ingest: stored');
    } else {
      log.debug({ skipped, source }, 'metal snapshot ingest: unchanged');
    }

    return { ok: true, inserted, skipped };
  } catch (e) {
    log.warn({ err: e }, 'metal snapshot ingest failed');
    return { ok: false, inserted: 0, skipped: false, reason: 'error' };
  }
}
