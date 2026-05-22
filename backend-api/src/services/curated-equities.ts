import type { Redis } from 'ioredis';
import type { FastifyBaseLogger } from 'fastify';
import { InstrumentKind, QuoteCategory, type SessionState } from '@prisma/client';
import type { Env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { getOrFetchJsonCache } from '../lib/redis-cache.js';
import {
  fetchEquityHistoryFromChart,
  fetchEquityQuoteFromChart,
  resolveTradingViewSymbol,
  type HistoryRange,
  type TvPricePeriod,
} from './connectors/equities.js';
import {
  historyRangeToOhlcvResolution,
  tvTimeToBarDate,
  upsertOhlcvBars,
} from './ohlcv-bars.js';
import type { EgyptScannerProfile, EgyptScannerRelatedRow } from './connectors/tradingview-profile-egypt.js';
import { scanEgyptMarketFull } from './connectors/tradingview-scanner-egypt.js';
import { getEgxSessionState } from './session-egx.js';

const LIST_TTL_SEC = 90;
const QUOTE_TTL_SEC = 60;
const HIST_TTL_SEC = 300;
const STALE_AFTER_SEC = 300;

function equityCacheOpts(env: Env, log: FastifyBaseLogger) {
  return {
    staleTtlSec: STALE_AFTER_SEC,
    lockTtlSec: env.REDIS_CACHE_LOCK_TTL_SEC,
    waitMs: env.REDIS_CACHE_WAIT_MS,
    log,
  };
}

function listCacheKey(): string {
  return 'cache:eq:v1:curated:list:v3';
}

function marketEgxListCacheKey(): string {
  return 'cache:eq:v1:market:egx:v2';
}

function quoteCacheKey(tvId: string): string {
  return `cache:eq:v1:quote:${tvId}`;
}

function histCacheKey(tvId: string, range: string): string {
  return `cache:eq:v1:hist:${tvId}:${range}`;
}

export function normalizeEquitySymbolParam(raw: string): string {
  const t = decodeURIComponent(raw).trim().toUpperCase();
  return t.startsWith('EGX:') ? t.slice(4) : t;
}

/** Allow TradingView-only detail/history for EGX tickers not yet in `instruments`. */
const TV_ONLY_TICKER = /^[A-Z0-9][A-Z0-9.-]{0,14}$/;

export function isPlausibleEgxTickerForTv(code: string): boolean {
  return TV_ONLY_TICKER.test(code);
}

async function equityDetailFromTradingViewOnly(
  env: Env,
  redis: Redis,
  log: FastifyBaseLogger,
  norm: string,
  signal?: AbortSignal,
): Promise<EquityDetailRow | null> {
  if (!isPlausibleEgxTickerForTv(norm)) return null;
  if (!env.EQUITIES_TV_ENABLED) return null;

  const tvId = resolveTradingViewSymbol(norm, null);
  const sessionState = mapSession();
  try {
    const q = await quoteForTvId(env, redis, log, tvId, signal);
    return {
      instrumentId: '',
      asOf: q.asOf,
      quoteCategory: QuoteCategory.indicative,
      sessionState,
      isStale: q.last == null,
      symbol: norm,
      name: norm,
      nameAr: norm,
      last: q.last,
      changePct: q.changePct,
      volume: q.volume,
      high: q.high,
      low: q.low,
      open: q.open,
      exchange: 'EGX',
      tvSymbol: tvId,
    };
  } catch (e) {
    log.warn({ e, tvId, code: norm }, 'equity TV-only detail quote failed');
    return {
      instrumentId: '',
      asOf: new Date().toISOString(),
      quoteCategory: QuoteCategory.indicative,
      sessionState,
      isStale: true,
      symbol: norm,
      name: norm,
      nameAr: norm,
      last: null,
      changePct: null,
      volume: null,
      high: null,
      low: null,
      open: null,
      exchange: 'EGX',
      tvSymbol: tvId,
    };
  }
}

export type EquityListRow = {
  instrumentId: string;
  asOf: string;
  quoteCategory: 'official' | 'indicative' | 'estimate';
  sessionState: SessionState;
  isStale: boolean;
  symbol: string;
  /** English display name (stable for APIs / LTR). */
  name: string;
  /** Arabic display name from instruments. */
  nameAr: string;
  last: number | null;
  changePct: number | null;
  /** TradingView CDN SVG when known. */
  logoUrl?: string | null;
};

export type EquityDetailRow = EquityListRow & {
  volume: number | null;
  high: number | null;
  low: number | null;
  open: number | null;
  exchange: string;
  tvSymbol: string;
  /** TradingView Egypt scanner snapshot (when upstream enabled). */
  profile?: EgyptScannerProfile | null;
  /** Same `industry` bucket on EGX (TradingView), excluding this symbol. */
  relatedStocks?: EgyptScannerRelatedRow[];
};

export type HistoryPoint = {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number | null;
};

function mapSession(): SessionState {
  return getEgxSessionState();
}

function periodToPoint(p: TvPricePeriod): HistoryPoint {
  return {
    t: new Date(p.time * 1000).toISOString(),
    o: p.open,
    h: p.max,
    l: p.min,
    c: p.close,
    v: Number.isFinite(p.volume) ? Math.round(p.volume) : null,
  };
}

/** Cached last / change from TradingView chart (shared by equities and indices). */
export async function quoteForTvId(
  env: Env,
  redis: Redis,
  log: FastifyBaseLogger,
  tvId: string,
  signal?: AbortSignal,
): Promise<{
  last: number | null;
  changePct: number | null;
  volume: number | null;
  high: number | null;
  low: number | null;
  open: number | null;
  asOf: string;
}> {
  if (!env.EQUITIES_TV_ENABLED) {
    const asOf = new Date().toISOString();
    return { last: null, changePct: null, volume: null, high: null, low: null, open: null, asOf };
  }

  const { data } = await getOrFetchJsonCache(
    redis,
    quoteCacheKey(tvId),
    QUOTE_TTL_SEC,
    log,
    async () => {
      const q = await fetchEquityQuoteFromChart(tvId, signal);
      const asOf = new Date(q.barTime * 1000).toISOString();
      return {
        last: q.last,
        changePct: q.changePct,
        volume: q.volume,
        high: q.high,
        low: q.low,
        open: q.open,
        asOf,
      };
    },
    equityCacheOpts(env, log),
  );
  return { ...data, open: data.open ?? null };
}

export async function listCuratedEquities(
  env: Env,
  redis: Redis,
  log: FastifyBaseLogger,
  signal?: AbortSignal,
): Promise<{ items: EquityListRow[]; bundleFetchedAt: string }> {
  const key = listCacheKey();
  const { data: items, fetchedAt: bundleFetchedAt } = await getOrFetchJsonCache(
    redis,
    key,
    LIST_TTL_SEC,
    log,
    async () => {
      const rows = await prisma.instrument.findMany({
        where: { kind: InstrumentKind.equity, isConsumerVisible: true },
        orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      });

      const sessionState = mapSession();
      return Promise.all(
        rows.map(async (ins) => {
          const tvId = resolveTradingViewSymbol(ins.code, ins.metadata);
          try {
            const q = await quoteForTvId(env, redis, log, tvId, signal);
            return {
              instrumentId: ins.id,
              asOf: q.asOf,
              quoteCategory: QuoteCategory.indicative,
              sessionState,
              isStale: false,
              symbol: ins.code,
              name: ins.displayNameEn,
              nameAr: ins.displayNameAr,
              last: q.last,
              changePct: q.changePct,
            };
          } catch (e) {
            log.warn({ e, tvId, code: ins.code }, 'equity quote failed');
            return {
              instrumentId: ins.id,
              asOf: new Date().toISOString(),
              quoteCategory: QuoteCategory.indicative,
              sessionState,
              isStale: true,
              symbol: ins.code,
              name: ins.displayNameEn,
              nameAr: ins.displayNameAr,
              last: null,
              changePct: null,
            };
          }
        }),
      );
    },
    equityCacheOpts(env, log),
  );
  return { items, bundleFetchedAt };
}

/**
 * Full EGX equity universe for the consumer market list (~all listed stocks via TradingView scanner),
 * with DB display names when an `instruments` row exists. Falls back to {@link listCuratedEquities} on failure.
 */
export async function listMarketEgxStocksCached(
  env: Env,
  redis: Redis,
  log: FastifyBaseLogger,
  signal?: AbortSignal,
): Promise<{ items: EquityListRow[]; bundleFetchedAt: string }> {
  const key = marketEgxListCacheKey();
  try {
    const { data: items, fetchedAt: bundleFetchedAt } = await getOrFetchJsonCache(
      redis,
      key,
      LIST_TTL_SEC,
      log,
      async () => {
        const scanned = await scanEgyptMarketFull(signal);
        if (scanned.length === 0) {
          throw new Error('egypt market scan returned zero rows');
        }

        const codes = [...new Set(scanned.map((r) => r.symbol.trim().toUpperCase()))];
        const insRows = await prisma.instrument.findMany({
          where: { kind: InstrumentKind.equity, code: { in: codes } },
          select: { id: true, code: true, displayNameEn: true, displayNameAr: true },
        });
        const byCode = new Map(insRows.map((row) => [row.code.toUpperCase(), row]));

        const sessionState = mapSession();
        const asOf = new Date().toISOString();
        return scanned.map((m) => {
          const ins = byCode.get(m.symbol.toUpperCase());
          const nameAr = ins?.displayNameAr?.trim() || m.nameAr?.trim() || '';
          const name = (ins?.displayNameEn?.trim() || m.nameEn).trim() || m.symbol;
          return {
            instrumentId: ins?.id ?? '',
            asOf,
            quoteCategory: QuoteCategory.indicative,
            sessionState,
            isStale: !Number.isFinite(m.close),
            symbol: m.symbol,
            name,
            nameAr,
            last: Number.isFinite(m.close) ? m.close : null,
            changePct: Number.isFinite(m.changePct) ? m.changePct : null,
            logoUrl: m.logoUrl ?? null,
          };
        });
      },
      equityCacheOpts(env, log),
    );
    return { items, bundleFetchedAt };
  } catch (e) {
    log.warn({ e }, 'market EGX scan failed; falling back to curated list');
    return listCuratedEquities(env, redis, log, signal);
  }
}

export async function getCuratedEquityDetail(
  env: Env,
  redis: Redis,
  log: FastifyBaseLogger,
  symbolParam: string,
  signal?: AbortSignal,
): Promise<EquityDetailRow | null> {
  const norm = normalizeEquitySymbolParam(symbolParam);
  const ins = await prisma.instrument.findFirst({
    where: {
      kind: InstrumentKind.equity,
      isConsumerVisible: true,
      code: norm,
    },
  });
  if (!ins) {
    return equityDetailFromTradingViewOnly(env, redis, log, norm, signal);
  }

  const tvId = resolveTradingViewSymbol(ins.code, ins.metadata);
  const sessionState = mapSession();
  try {
    const q = await quoteForTvId(env, redis, log, tvId, signal);
    return {
      instrumentId: ins.id,
      asOf: q.asOf,
      quoteCategory: QuoteCategory.indicative,
      sessionState,
      isStale: q.last == null,
      symbol: ins.code,
      name: ins.displayNameEn,
      last: q.last,
      changePct: q.changePct,
      volume: q.volume,
      high: q.high,
      low: q.low,
      open: q.open,
      nameAr: ins.displayNameAr,
      exchange: 'EGX',
      tvSymbol: tvId,
    };
  } catch (e) {
    log.warn({ e, tvId, code: ins.code }, 'equity detail quote failed');
    return {
      instrumentId: ins.id,
      asOf: new Date().toISOString(),
      quoteCategory: QuoteCategory.indicative,
      sessionState,
      isStale: true,
      symbol: ins.code,
      name: ins.displayNameEn,
      last: null,
      changePct: null,
      volume: null,
      high: null,
      low: null,
      open: null,
      nameAr: ins.displayNameAr,
      exchange: 'EGX',
      tvSymbol: tvId,
    };
  }
}

export async function getCuratedEquityHistory(
  env: Env,
  redis: Redis,
  log: FastifyBaseLogger,
  symbolParam: string,
  range: HistoryRange,
  signal?: AbortSignal,
): Promise<{ symbol: string; resolution: string; points: HistoryPoint[] } | null> {
  if (!env.EQUITIES_TV_ENABLED) {
    throw new Error('Equities chart upstream disabled');
  }

  const norm = normalizeEquitySymbolParam(symbolParam);
  const ins = await prisma.instrument.findFirst({
    where: {
      kind: InstrumentKind.equity,
      isConsumerVisible: true,
      code: norm,
    },
  });
  if (!ins) {
    if (!isPlausibleEgxTickerForTv(norm)) return null;
    const tvId = resolveTradingViewSymbol(norm, null);
    const points = await loadHistoryPoints(env, redis, log, tvId, range, signal);
    return { symbol: norm, resolution: range, points };
  }

  const tvId = resolveTradingViewSymbol(ins.code, ins.metadata);
  const points = await loadHistoryPoints(env, redis, log, tvId, range, signal, {
    persistInstrumentId: ins.id,
    persistSymbol: ins.code,
  });
  return { symbol: ins.code, resolution: range, points };
}

async function loadHistoryPoints(
  env: Env,
  redis: Redis,
  log: FastifyBaseLogger,
  tvId: string,
  range: HistoryRange,
  signal?: AbortSignal,
  persist?: { persistInstrumentId: string; persistSymbol: string },
): Promise<HistoryPoint[]> {
  const ckey = histCacheKey(tvId, range);
  const { data } = await getOrFetchJsonCache(
    redis,
    ckey,
    HIST_TTL_SEC,
    log,
    async () => {
      const bars = await fetchEquityHistoryFromChart(tvId, range, signal);
      if (env.OHLCV_PERSIST_ENABLED && persist) {
        void persistHistoryBars(persist.persistInstrumentId, range, bars).catch((e) =>
          log.warn({ err: e, symbol: persist.persistSymbol }, 'ohlcv persist failed'),
        );
      }
      return bars.map(periodToPoint);
    },
    equityCacheOpts(env, log),
  );
  return data;
}

async function persistHistoryBars(
  instrumentId: string,
  range: HistoryRange,
  bars: Array<{ time: number; open: number; max: number; min: number; close: number; volume: number }>,
): Promise<void> {
  const resolution = historyRangeToOhlcvResolution(range);
  await upsertOhlcvBars(
    instrumentId,
    resolution,
    bars.map((b) => ({
      barTime: tvTimeToBarDate(b.time),
      open: b.open,
      high: b.max,
      low: b.min,
      close: b.close,
      volume: b.volume,
    })),
  );
}

export { type HistoryRange };
