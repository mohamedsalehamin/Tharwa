import { createRequire } from 'node:module';
import { observeConnector } from '../../lib/connector-metrics.js';
import { parseEquityMetadata } from '../../lib/instrument-metadata.js';
import { withTvChartSlot } from '../../lib/tv-chart-limiter.js';

const require = createRequire(import.meta.url);

export type TvPricePeriod = {
  time: number;
  open: number;
  close: number;
  max: number;
  min: number;
  volume: number;
};

type TvChart = {
  periods: TvPricePeriod[];
  onUpdate: (cb: () => void) => void;
  onError: (cb: (...args: unknown[]) => void) => void;
  setMarket: (symbol: string, opts: { timeframe: string; range: number }) => void;
  delete: () => void;
};

type TvClient = {
  Session: { Chart: new () => TvChart };
  end: () => Promise<void>;
};

function loadTv(): { Client: new () => TvClient } {
  return require('@mathieuc/tradingview') as { Client: new () => TvClient };
}

function isTvRateLimitMessage(msg: string): boolean {
  return msg.includes('429') || /too many requests/i.test(msg);
}

function tvChartSnapshot(
  tvId: string,
  timeframe: string,
  range: number,
  signal: AbortSignal | undefined,
  settleMs: number,
  capMs: number,
): Promise<TvPricePeriod[]> {
  return withTvChartSlot(
    () =>
      new Promise<TvPricePeriod[]>((resolve, reject) => {
        const TV = loadTv();
        const client = new TV.Client();
        const chart = new client.Session.Chart();

        let debounce: ReturnType<typeof setTimeout> | undefined;
        let finished = false;

        const finish = (rows: TvPricePeriod[]) => {
      if (finished) return;
      finished = true;
      signal?.removeEventListener('abort', onAbort);
      clearTimeout(capTimer);
      if (debounce) clearTimeout(debounce);
      try {
        chart.delete();
      } catch {
        /* ignore */
      }
      void client.end().catch(() => undefined);
      resolve(rows);
    };

        const fail = (err: Error) => {
          if (finished) return;
          finished = true;
          signal?.removeEventListener('abort', onAbort);
          clearTimeout(capTimer);
          if (debounce) clearTimeout(debounce);
          try {
            chart.delete();
          } catch {
            /* ignore */
          }
          void client.end().catch(() => undefined);
          reject(err);
        };

        type TvClientWithError = TvClient & { onError: (cb: (...args: unknown[]) => void) => void };
        (client as TvClientWithError).onError((...args: unknown[]) => {
          const msg = args.map(String).join(' ');
          if (isTvRateLimitMessage(msg)) {
            fail(new Error(`TradingView rate limited: ${msg}`));
          }
        });

        const onAbort = () => {
          fail(new Error('aborted'));
        };
        signal?.addEventListener('abort', onAbort, { once: true });

        const capTimer = setTimeout(() => {
          const rows = [...chart.periods].sort((a, b) => a.time - b.time);
          finish(rows);
        }, capMs);

        chart.onError((...args: unknown[]) => {
          const msg = JSON.stringify(args);
          if (isTvRateLimitMessage(msg)) {
            fail(new Error(`TradingView rate limited: ${msg}`));
            return;
          }
          fail(new Error(`TradingView chart error: ${msg}`));
        });

        chart.onUpdate(() => {
          if (finished) return;
          if (debounce) clearTimeout(debounce);
          debounce = setTimeout(() => {
            const rows = [...chart.periods].sort((a, b) => a.time - b.time);
            if (rows.length > 0) finish(rows);
          }, settleMs);
        });

        try {
          chart.setMarket(tvId, { timeframe, range });
        } catch (e) {
          fail(e instanceof Error ? e : new Error(String(e)));
        }
      }),
  );
}

export function resolveTradingViewSymbol(code: string, metadata: unknown): string {
  const { tvSymbol } = parseEquityMetadata(metadata);
  if (tvSymbol) return tvSymbol;
  const c = code.trim();
  if (c.includes(':')) return c;
  return `EGX:${c.toUpperCase()}`;
}

/** Latest daily bar + prior close for day change (debounced chart load). */
export async function fetchEquityQuoteFromChart(
  tvId: string,
  signal?: AbortSignal,
): Promise<{
  last: number;
  changePct: number | null;
  volume: number | null;
  high: number;
  low: number;
  open: number;
  barTime: number;
}> {
  return observeConnector('equities_tv', 'chart_quote', async () => {
  const rows = await tvChartSnapshot(tvId, 'D', 8, signal, 600, 10_000);
  if (rows.length === 0) throw new Error('No chart data');
  const lastBar = rows[rows.length - 1]!;
  const prev = rows.length > 1 ? rows[rows.length - 2]! : null;
  let changePct: number | null = null;
  if (prev && prev.close > 0) {
    changePct = ((lastBar.close - prev.close) / prev.close) * 100;
  }
  return {
    last: lastBar.close,
    changePct,
    volume: Number.isFinite(lastBar.volume) ? Math.round(lastBar.volume) : null,
    high: lastBar.max,
    low: lastBar.min,
    open: lastBar.open,
    barTime: lastBar.time,
  };
  });
}

export type HistoryRange = '1d' | '1w' | '1m' | '1y';

function rangeParams(r: HistoryRange): { timeframe: string; range: number } {
  switch (r) {
    case '1d':
      return { timeframe: '5', range: 90 };
    case '1w':
      return { timeframe: '60', range: 56 };
    case '1m':
      return { timeframe: 'D', range: 28 };
    case '1y':
    default:
      return { timeframe: 'D', range: 270 };
  }
}

export async function fetchEquityHistoryFromChart(
  tvId: string,
  range: HistoryRange,
  signal?: AbortSignal,
): Promise<TvPricePeriod[]> {
  return observeConnector('equities_tv', `chart_history_${range}`, async () => {
    const { timeframe, range: barCount } = rangeParams(range);
    return tvChartSnapshot(tvId, timeframe, barCount, signal, 900, 25_000);
  });
}
