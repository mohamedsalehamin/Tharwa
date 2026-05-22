import { createRequire } from 'node:module';
import type { Env } from '../../config/env.js';
import { observeConnector } from '../../lib/connector-metrics.js';
import type { EgyptTelegramBundle } from '../egypt-telegram-bundle.js';

const require = createRequire(import.meta.url);

export type QuoteMeta = {
  asOf: string;
  quoteCategory: 'official' | 'indicative' | 'estimate';
  sessionState: 'open' | 'closed' | 'pre' | 'post' | 'unknown';
  isStale: boolean;
};

export type FxRateItem = QuoteMeta & {
  baseCurrency: string;
  quoteCurrency: 'EGP';
  rate: number;
  changePct: number | null;
  /** From admin `instruments` row (consumer-facing label). */
  displayNameEn?: string;
  displayNameAr?: string;
  /** Admin-uploaded flag image URL or `/files/...` path. */
  flagUrl?: string;
};

const BASES = ['USD', 'EUR', 'GBP', 'SAR', 'AED'] as const;

type FxBase = (typeof BASES)[number];

/**
 * ICE `FX_IDC` uses compact pair ids (e.g. `EUREGP`), not `EUR_EGP`. `SAREGP` / direct `AEDEGP`
 * are not listed — SAR and AED are derived from USD/EGP ÷ USD/SAR and USD/EGP ÷ USD/AED.
 * Override any base with `FX_TV_SYMBOLS` JSON, e.g. `{"AED":"SAXO:USDAED"}`.
 */
const TV_DEFAULT_DIRECT: Record<'USD' | 'EUR' | 'GBP', string> = {
  USD: 'FX_IDC:USDEGP',
  EUR: 'FX_IDC:EUREGP',
  GBP: 'FX_IDC:GBPEGP',
};

const TV_CROSS_USD_QUOTE: Record<'SAR' | 'AED', string> = {
  SAR: 'FX_IDC:USDSAR',
  AED: 'FX_IDC:USDAED',
};

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** Plausible CBE / channel “official” USD–EGP band (reject parse glitches). */
function isPlausibleOfficialUsdEgp(n: number | null | undefined): n is number {
  return n != null && Number.isFinite(n) && n >= 40 && n <= 80;
}

/**
 * Anchor all FX rows to Telegram `dollar_official` while preserving cross-rates from the upstream snapshot.
 */
export function applyTelegramOfficialUsdToFxItems(
  items: FxRateItem[],
  dollarOfficial: number,
  upstreamUsdEgp: number,
): FxRateItem[] {
  if (!isPlausibleOfficialUsdEgp(dollarOfficial) || upstreamUsdEgp <= 0) return items;
  const scale = dollarOfficial / upstreamUsdEgp;
  return items.map((item) => ({
    ...item,
    quoteCategory: 'official' as const,
    rate: round4(item.baseCurrency === 'USD' ? dollarOfficial : item.rate * scale),
  }));
}

function parseTvOverrides(env: Env): Partial<Record<FxBase, string>> {
  if (!env.FX_TV_SYMBOLS?.trim()) return {};
  return JSON.parse(env.FX_TV_SYMBOLS) as Partial<Record<FxBase, string>>;
}

/** Convert TradingView quote `lp` + scaling fields to display price. */
function tvLpToPrice(data: { lp?: number; pricescale?: number; minmov?: number }): number {
  if (data.lp == null || Number.isNaN(Number(data.lp))) {
    throw new Error('TradingView quote missing lp');
  }
  const lp = Number(data.lp);
  const ps = data.pricescale && data.pricescale > 0 ? Number(data.pricescale) : 1;
  const mv = data.minmov && data.minmov > 0 ? Number(data.minmov) : 1;
  return (lp * mv) / ps;
}

type TvQuoteSession = {
  Market: new (symbol: string, session?: string) => TvMarket;
  delete: () => void;
};

type TvMarket = {
  onData: (cb: (data: { lp?: number; pricescale?: number; minmov?: number }) => void) => void;
  onError: (cb: (...args: unknown[]) => void) => void;
  close: () => void;
};

type TvClient = {
  Session: { Quote: new (opts?: { fields?: string }) => TvQuoteSession };
  end: () => Promise<void>;
};

function fetchOneTradingViewSymbol(
  quoteSession: TvQuoteSession,
  tvSymbol: string,
  signal?: AbortSignal,
): Promise<number> {
  const market = new quoteSession.Market(tvSymbol, 'regular');

  return new Promise<number>((resolve, reject) => {
    const onAbort = () => {
      market.close();
      reject(new Error('aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    const to = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      market.close();
      reject(new Error(`TradingView quote timeout for ${tvSymbol}`));
    }, 25_000);

    const finish = (fn: () => void) => {
      clearTimeout(to);
      signal?.removeEventListener('abort', onAbort);
      fn();
    };

    market.onError((...args: unknown[]) => {
      finish(() => {
        market.close();
        reject(new Error(`TradingView error for ${tvSymbol}: ${JSON.stringify(args)}`));
      });
    });

    market.onData((data) => {
      try {
        const price = tvLpToPrice(data);
        finish(() => {
          market.close();
          resolve(price);
        });
      } catch {
        /* wait for lp */
      }
    });
  });
}

async function fetchTradingViewPrices(
  quoteSession: TvQuoteSession,
  symbols: string[],
  signal?: AbortSignal,
): Promise<Map<string, number>> {
  const unique = [...new Set(symbols)];
  const entries = await Promise.all(
    unique.map(async (sym) => [sym, await fetchOneTradingViewSymbol(quoteSession, sym, signal)] as const),
  );
  return new Map(entries);
}

/** Quotes via [@mathieuc/tradingview](https://github.com/Mathieu2301/TradingView-API) (single WS session). */
async function fetchFxTradingView(env: Env, signal?: AbortSignal): Promise<{ items: FxRateItem[]; fetchedAt: Date }> {
  const TradingView = require('@mathieuc/tradingview') as { Client: new () => TvClient };
  const client = new TradingView.Client();
  const quoteSession = new client.Session.Quote({ fields: 'price' });
  const ov = parseTvOverrides(env);
  const fetchedAt = new Date();

  const usdEgpId = ov.USD ?? TV_DEFAULT_DIRECT.USD;
  const eurId = ov.EUR ?? TV_DEFAULT_DIRECT.EUR;
  const gbpId = ov.GBP ?? TV_DEFAULT_DIRECT.GBP;

  const toFetch: string[] = [usdEgpId, eurId, gbpId];
  if (ov.SAR) toFetch.push(ov.SAR);
  else toFetch.push(TV_CROSS_USD_QUOTE.SAR);
  if (ov.AED) toFetch.push(ov.AED);
  else toFetch.push(TV_CROSS_USD_QUOTE.AED);

  try {
    const prices = await fetchTradingViewPrices(quoteSession, toFetch, signal);
    const usdEgp = prices.get(usdEgpId);
    if (usdEgp == null || usdEgp <= 0) throw new Error('TradingView missing USD/EGP');

    const rateFor = (base: FxBase): number => {
      if (base === 'USD') return usdEgp;
      if (base === 'EUR') {
        const p = prices.get(eurId);
        if (p == null || p <= 0) throw new Error(`TradingView missing ${eurId}`);
        return p;
      }
      if (base === 'GBP') {
        const p = prices.get(gbpId);
        if (p == null || p <= 0) throw new Error(`TradingView missing ${gbpId}`);
        return p;
      }
      if (base === 'SAR') {
        if (ov.SAR) {
          const p = prices.get(ov.SAR);
          if (p == null || p <= 0) throw new Error(`TradingView missing ${ov.SAR}`);
          return p;
        }
        const sarPerUsd = prices.get(TV_CROSS_USD_QUOTE.SAR);
        if (sarPerUsd == null || sarPerUsd <= 0) throw new Error('TradingView missing FX_IDC:USDSAR');
        return usdEgp / sarPerUsd;
      }
      if (ov.AED) {
        const p = prices.get(ov.AED);
        if (p == null || p <= 0) throw new Error(`TradingView missing ${ov.AED}`);
        return p;
      }
      const aedPerUsd = prices.get(TV_CROSS_USD_QUOTE.AED);
      if (aedPerUsd == null || aedPerUsd <= 0) throw new Error('TradingView missing FX_IDC:USDAED');
      return usdEgp / aedPerUsd;
    };

    const items: FxRateItem[] = BASES.map((base) => ({
      asOf: fetchedAt.toISOString(),
      quoteCategory: 'indicative' as const,
      sessionState: 'unknown' as const,
      isStale: false,
      baseCurrency: base,
      quoteCurrency: 'EGP' as const,
      rate: round4(rateFor(base)),
      changePct: null,
    }));

    return { items, fetchedAt };
  } finally {
    quoteSession.delete();
    await client.end();
  }
}

/** Free HTTP fallback (USD base). Not CBE official; labeled `indicative`. */
async function fetchFxHttpOpenEr(env: Env, signal?: AbortSignal): Promise<{ items: FxRateItem[]; fetchedAt: Date }> {
  const url = env.FX_HTTP_URL;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`FX HTTP upstream HTTP ${res.status}`);
  }
  const body = (await res.json()) as {
    result?: string;
    rates?: Record<string, number>;
    time_last_update_utc?: string;
  };
  if (body.result !== 'success' || !body.rates?.EGP) {
    throw new Error('FX HTTP invalid payload (expected open.er-api v6 shape)');
  }
  const r = body.rates;
  const egpPerUsd = r.EGP;
  const asOf = body.time_last_update_utc
    ? new Date(body.time_last_update_utc).toISOString()
    : new Date().toISOString();

  const items: FxRateItem[] = BASES.map((sym) => {
    let rate: number;
    if (sym === 'USD') {
      rate = egpPerUsd;
    } else {
      const perUsd = r[sym];
      if (perUsd === undefined || perUsd <= 0) {
        throw new Error(`Missing HTTP rate for ${sym}`);
      }
      rate = egpPerUsd / perUsd;
    }
    return {
      asOf,
      quoteCategory: 'indicative' as const,
      sessionState: 'unknown' as const,
      isStale: false,
      baseCurrency: sym,
      quoteCurrency: 'EGP' as const,
      rate: round4(rate),
      changePct: null,
    };
  });

  return { items, fetchedAt: new Date(asOf) };
}

export async function fetchFxRates(
  env: Env,
  signal?: AbortSignal,
  telegramBundle?: EgyptTelegramBundle | null,
): Promise<{ items: FxRateItem[]; fetchedAt: Date }> {
  const operation = env.FX_MOCK_JSON ? 'mock' : env.FX_PROVIDER;
  return observeConnector('fx', operation, async () => {
    if (env.FX_MOCK_JSON) {
      const parsed = JSON.parse(env.FX_MOCK_JSON) as FxRateItem[];
      return { items: parsed, fetchedAt: new Date() };
    }

    let result: { items: FxRateItem[]; fetchedAt: Date };
    if (env.FX_PROVIDER === 'tradingview') {
      result = await fetchFxTradingView(env, signal);
    } else {
      result = await fetchFxHttpOpenEr(env, signal);
    }

    const officialUsd = telegramBundle?.parsed.dollar_official;
    if (!isPlausibleOfficialUsdEgp(officialUsd)) return result;

    const usdRow = result.items.find((i) => i.baseCurrency === 'USD');
    if (!usdRow || usdRow.rate <= 0) return result;

    const asOf = telegramBundle?.parsed.timestamp ?? telegramBundle?.fetchedAt ?? result.fetchedAt.toISOString();
    return {
      fetchedAt: new Date(asOf),
      items: applyTelegramOfficialUsdToFxItems(result.items, officialUsd, usdRow.rate).map((i) => ({
        ...i,
        asOf: typeof asOf === 'string' ? asOf : i.asOf,
      })),
    };
  });
}
