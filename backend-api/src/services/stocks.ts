import { InstrumentKind } from '@prisma/client';
import type { Redis } from 'ioredis';
import type { FastifyBaseLogger } from 'fastify';
import type { Env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { getOrFetchRedisCache } from '../lib/redis-cache.js';
import {
  tradingViewSearchIndicators,
  tradingViewSearchSymbols,
  type TvIndicatorSearchRow,
  type TvSymbolSearchRow,
} from './connectors/tradingview-search.js';
import { scanEgyptMovers, type EgxMoverList, type EgxMoverRow } from './connectors/tradingview-scanner-egypt.js';
import { quoteForTvId } from './curated-equities.js';

const TTL_SEC = 120;
const TTL_EGX_MOVERS_SEC = 60;
const TTL_EGX_INDICES_QUOTES_SEC = 90;
const STALE_AFTER_SEC = 300;

/** TradingView `searchMarketV3` — `EGX:` + `search_type` filters EGX stocks vs indices. */
export const TRADINGVIEW_EGX_EXCHANGE_QUERY = 'EGX:' as const;
/** @deprecated use TRADINGVIEW_EGX_EXCHANGE_QUERY */
export const TRADINGVIEW_EGX_STOCK_QUERY = TRADINGVIEW_EGX_EXCHANGE_QUERY;

type Cached<T> = { items: T[] };
type CachedMovers = { items: EgxMoverRow[]; totalCount: number };

function symbolCacheKey(q: string, type: string | undefined, offset: number): string {
  const t = type ?? '_';
  return `cache:stocks:v1:sym:${t}:${offset}:${q.slice(0, 160)}`;
}

function indicatorCacheKey(q: string, limit: number): string {
  return `cache:stocks:v1:ind:${limit}:${q.slice(0, 160)}`;
}

function egxMoversCacheKey(list: EgxMoverList, offset: number, limit: number): string {
  return `cache:stocks:v1:egxmov:v5:${list}:${offset}:${limit}`;
}

function egxIndicesQuotesCacheKey(limit: number, offset: number): string {
  return `cache:stocks:v1:egxidx:quotes:v1:${limit}:${offset}`;
}

async function enrichEgxMoversFromDb(
  log: FastifyBaseLogger,
  items: EgxMoverRow[],
): Promise<EgxMoverRow[]> {
  try {
    if (items.length === 0) return items;
    const codes = [...new Set(items.map((i) => i.symbol.trim().toUpperCase()))];
    const rows = await prisma.instrument.findMany({
      where: { code: { in: codes }, kind: InstrumentKind.equity },
      select: { id: true, code: true, displayNameAr: true },
    });
    const byCode = new Map(rows.map((r) => [r.code.toUpperCase(), r]));
    return items.map((it) => {
      const row = byCode.get(it.symbol.toUpperCase());
      if (!row) return it;
      const ar = row.displayNameAr?.trim();
      return {
        ...it,
        nameAr: ar && ar.length > 0 ? ar : it.nameAr,
        instrumentId: row.id,
      };
    });
  } catch (e) {
    log.warn({ e }, 'egx movers DB enrich failed');
    return items;
  }
}

function cacheOpts(env: Env, log: FastifyBaseLogger) {
  return {
    lockTtlSec: env.REDIS_CACHE_LOCK_TTL_SEC,
    waitMs: env.REDIS_CACHE_WAIT_MS,
    staleTtlSec: STALE_AFTER_SEC,
    log,
  };
}

export async function searchCompaniesCached(
  env: Env,
  redis: Redis,
  log: FastifyBaseLogger,
  params: { q: string; type?: string; limit: number; offset: number },
): Promise<{ items: TvSymbolSearchRow[]; bundleFetchedAt: string }> {
  const key = symbolCacheKey(params.q, params.type, params.offset);
  const { data, fetchedAt } = await getOrFetchRedisCache<Cached<TvSymbolSearchRow>>({
    redis,
    cacheKey: key,
    freshTtlSec: TTL_SEC,
    ...cacheOpts(env, log),
    fetch: async () => {
      const rows = await tradingViewSearchSymbols(params.q, params.type, params.offset);
      return { fetchedAt: new Date().toISOString(), data: { items: rows } };
    },
  });
  return { items: data.items.slice(0, params.limit), bundleFetchedAt: fetchedAt };
}

export async function searchIndicatorsCached(
  env: Env,
  redis: Redis,
  log: FastifyBaseLogger,
  params: { q: string; limit: number },
): Promise<{ items: TvIndicatorSearchRow[]; bundleFetchedAt: string }> {
  const key = indicatorCacheKey(params.q, params.limit);
  const { data, fetchedAt } = await getOrFetchRedisCache<Cached<TvIndicatorSearchRow>>({
    redis,
    cacheKey: key,
    freshTtlSec: TTL_SEC,
    ...cacheOpts(env, log),
    fetch: async () => {
      const rows = await tradingViewSearchIndicators(params.q, params.limit);
      return { fetchedAt: new Date().toISOString(), data: { items: rows } };
    },
  });
  return { items: data.items.slice(0, params.limit), bundleFetchedAt: fetchedAt };
}

/** Listed Egyptian equities on EGX (via TradingView symbol search). */
export function searchEgyptStocksCached(
  env: Env,
  redis: Redis,
  log: FastifyBaseLogger,
  params: { limit: number; offset: number },
): Promise<{ items: TvSymbolSearchRow[]; bundleFetchedAt: string }> {
  return searchCompaniesCached(env, redis, log, {
    q: TRADINGVIEW_EGX_EXCHANGE_QUERY,
    type: 'stock',
    limit: params.limit,
    offset: params.offset,
  });
}

/** EGX benchmark / sector indices (TradingView symbol search, `EGX:` + `index`). */
export function searchEgyptIndicesCached(
  env: Env,
  redis: Redis,
  log: FastifyBaseLogger,
  params: { limit: number; offset: number },
): Promise<{ items: TvSymbolSearchRow[]; bundleFetchedAt: string }> {
  return searchCompaniesCached(env, redis, log, {
    q: TRADINGVIEW_EGX_EXCHANGE_QUERY,
    type: 'index',
    limit: params.limit,
    offset: params.offset,
  });
}

export type EgyptIndexRow = TvSymbolSearchRow & {
  last: number | null;
  changePct: number | null;
  quoteAsOf: string | null;
};

/** Attach chart last / change% using `row.id` as TradingView symbol (e.g. `EGX:EGX30`). */
export async function enrichEgyptIndicesWithQuotes(
  env: Env,
  redis: Redis,
  log: FastifyBaseLogger,
  rows: TvSymbolSearchRow[],
  signal?: AbortSignal,
): Promise<EgyptIndexRow[]> {
  if (rows.length === 0) return [];
  const enriched: EgyptIndexRow[] = [];
  for (const r of rows) {
    const tvId = r.id?.trim();
    if (!tvId) {
      enriched.push({ ...r, last: null, changePct: null, quoteAsOf: null });
      continue;
    }
    try {
      const q = await quoteForTvId(env, redis, log, tvId, signal);
      enriched.push({
        ...r,
        last: q.last,
        changePct: q.changePct,
        quoteAsOf: q.asOf,
      });
    } catch (e) {
      log.warn({ e, tvId }, 'egx index quote failed');
      enriched.push({ ...r, last: null, changePct: null, quoteAsOf: null });
    }
  }
  return enriched;
}

/** Symbol search + indicative quotes (cached as one bundle to avoid TV bursts on every home load). */
export async function getEgyptIndicesWithQuotesCached(
  env: Env,
  redis: Redis,
  log: FastifyBaseLogger,
  params: { limit: number; offset: number },
  signal?: AbortSignal,
): Promise<{ items: EgyptIndexRow[]; bundleFetchedAt: string }> {
  const key = egxIndicesQuotesCacheKey(params.limit, params.offset);
  const { data, fetchedAt } = await getOrFetchRedisCache<Cached<EgyptIndexRow>>({
    redis,
    cacheKey: key,
    freshTtlSec: TTL_EGX_INDICES_QUOTES_SEC,
    ...cacheOpts(env, log),
    fetch: async () => {
      const { items, bundleFetchedAt } = await searchEgyptIndicesCached(env, redis, log, params);
      const withQuotes = await enrichEgyptIndicesWithQuotes(env, redis, log, items, signal);
      return { fetchedAt: bundleFetchedAt, data: { items: withQuotes } };
    },
  });
  return { items: data.items, bundleFetchedAt: fetchedAt };
}

export async function getEgxMoversCached(
  env: Env,
  redis: Redis,
  log: FastifyBaseLogger,
  params: { list: EgxMoverList; limit: number; offset: number },
): Promise<{ items: EgxMoverRow[]; totalCount: number; bundleFetchedAt: string }> {
  const key = egxMoversCacheKey(params.list, params.offset, params.limit);
  const { data, fetchedAt } = await getOrFetchRedisCache<CachedMovers>({
    redis,
    cacheKey: key,
    freshTtlSec: TTL_EGX_MOVERS_SEC,
    ...cacheOpts(env, log),
    fetch: async () => {
      const { totalCount, items: scanned } = await scanEgyptMovers(
        params.list,
        params.offset,
        params.limit,
      );
      const items = await enrichEgxMoversFromDb(log, scanned);
      return { fetchedAt: new Date().toISOString(), data: { items, totalCount } };
    },
  });
  return { items: data.items, totalCount: data.totalCount, bundleFetchedAt: fetchedAt };
}

export type { EgxMoverList, EgxMoverRow };
