import type { Redis } from 'ioredis';
import type { FastifyBaseLogger } from 'fastify';
import { InstrumentKind, OhlcvResolution, QuoteCategory, type SessionState } from '@prisma/client';
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
  /** Compact close-only series (daily) for an inline mini-chart; null when no stored history. */
  sparkline?: number[] | null;
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

/** Default cap on points returned in a sparkline series (keeps list payloads light). */
const SPARKLINE_MAX_POINTS = 60;

export type EquitySparkline = {
  symbol: string;
  range: HistoryRange;
  /** Close prices oldest → newest, ready to plot as a mini line. */
  closes: number[];
  /** Timestamp of the most recent point, or null when no data. */
  asOf: string | null;
  /** First → last percentage change over the series window. */
  changePct: number | null;
  /** True when no usable points were available. */
  isStale: boolean;
};

/** Evenly downsample a numeric series to at most `maxPoints`, always keeping the first and last value. */
export function downsampleSeries(values: number[], maxPoints: number): number[] {
  if (maxPoints <= 1 || values.length <= maxPoints) return values.slice();
  const out: number[] = [];
  const step = (values.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i += 1) {
    out.push(values[Math.round(i * step)]!);
  }
  return out;
}

/** Build a compact close-only sparkline from full OHLCV history points (pure, no I/O). */
export function sparklineFromPoints(
  symbol: string,
  range: HistoryRange,
  points: HistoryPoint[],
  maxPoints = SPARKLINE_MAX_POINTS,
): EquitySparkline {
  const closes = downsampleSeries(
    points.map((p) => p.c).filter((c) => Number.isFinite(c)),
    maxPoints,
  );
  const asOf = points.length > 0 ? (points[points.length - 1]!.t ?? null) : null;
  const first = closes[0];
  const last = closes[closes.length - 1];
  const changePct =
    first != null && last != null && first > 0 ? ((last - first) / first) * 100 : null;
  return {
    symbol,
    range,
    closes,
    asOf,
    changePct: changePct != null ? Math.round(changePct * 100) / 100 : null,
    isStale: closes.length === 0,
  };
}

/**
 * Group chronologically-ordered close bars by instrument into compact sparkline
 * series (pure; expects rows pre-sorted ascending by bar time). Instruments with
 * fewer than two finite closes are omitted so callers can treat absence as "no series".
 */
export function sparklineMapFromBars(
  rows: Array<{ instrumentId: string; close: number }>,
  maxPoints = SPARKLINE_MAX_POINTS,
): Map<string, number[]> {
  const grouped = new Map<string, number[]>();
  for (const r of rows) {
    if (!Number.isFinite(r.close)) continue;
    const arr = grouped.get(r.instrumentId) ?? [];
    arr.push(r.close);
    grouped.set(r.instrumentId, arr);
  }
  const out = new Map<string, number[]>();
  for (const [id, closes] of grouped) {
    if (closes.length >= 2) out.set(id, downsampleSeries(closes, maxPoints));
  }
  return out;
}

/**
 * Batched lookup of stored daily sparkline series for the given instruments via a
 * single query over persisted OHLCV bars (no upstream fan-out). Uses the `m1`
 * resolution bucket, which holds the daily bars captured from the default `1m` range.
 */
export async function listSparklineClosesByInstrument(
  instrumentIds: string[],
  maxPoints = SPARKLINE_MAX_POINTS,
): Promise<Map<string, number[]>> {
  const ids = [...new Set(instrumentIds.filter((id) => id.length > 0))];
  if (ids.length === 0) return new Map();
  const rows = await prisma.ohlcvBar.findMany({
    where: { instrumentId: { in: ids }, resolution: OhlcvResolution.m1 },
    orderBy: { barTime: 'asc' },
    select: { instrumentId: true, close: true },
  });
  return sparklineMapFromBars(
    rows.map((r) => ({ instrumentId: r.instrumentId, close: Number(r.close) })),
    maxPoints,
  );
}

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
  fetchedAt: string;
}> {
  if (!env.EQUITIES_TV_ENABLED) {
    const asOf = new Date().toISOString();
    return { last: null, changePct: null, volume: null, high: null, low: null, open: null, asOf, fetchedAt: asOf };
  }

  const { data, fetchedAt } = await getOrFetchJsonCache(
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
  return { ...data, open: data.open ?? null, fetchedAt };
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
      const sparklines = await listSparklineClosesByInstrument(rows.map((r) => r.id));
      return Promise.all(
        rows.map(async (ins) => {
          const tvId = resolveTradingViewSymbol(ins.code, ins.metadata);
          const sparkline = sparklines.get(ins.id) ?? null;
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
              sparkline,
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
              sparkline,
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
        const sparklines = await listSparklineClosesByInstrument(insRows.map((r) => r.id));

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
            sparkline: ins ? (sparklines.get(ins.id) ?? null) : null,
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

/**
 * Compact close-only sparkline for a single symbol, built on top of the cached history loader
 * so list/watchlist rows can render an inline mini-chart without pulling full OHLCV candles.
 */
export async function getCuratedEquitySparkline(
  env: Env,
  redis: Redis,
  log: FastifyBaseLogger,
  symbolParam: string,
  range: HistoryRange,
  signal?: AbortSignal,
): Promise<EquitySparkline | null> {
  const bundle = await getCuratedEquityHistory(env, redis, log, symbolParam, range, signal);
  if (!bundle) return null;
  return sparklineFromPoints(bundle.symbol, range, bundle.points);
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
