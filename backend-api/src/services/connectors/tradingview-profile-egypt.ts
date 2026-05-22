/** TradingView public scanner — single-symbol fundamentals + industry peers (EGX). */

import { observeConnector } from '../../lib/connector-metrics.js';

const SCAN_URL = 'https://scanner.tradingview.com/egypt/scan';

const PROFILE_COLUMNS = [
  'name',
  'description',
  'close',
  'change',
  'volume',
  'market_cap_basic',
  'dividends_yield',
  'price_earnings_ttm',
  'earnings_per_share_basic_ttm',
  'total_revenue_fy_h',
  'sector',
  'industry',
  'float_shares_outstanding',
  'total_shares_outstanding',
  'beta_1_year',
  'number_of_employees',
  'isin',
  'currency',
  'net_income_fy_h',
  'Recommend.All',
  'Recommend.MA',
  'Recommend.Other',
  'logoid',
] as const;

const RELATED_COLUMNS = ['name', 'close', 'change', 'description'] as const;

export type EgyptScannerProfile = {
  tickerName: string;
  description: string | null;
  close: number | null;
  changePct: number | null;
  volume: number | null;
  marketCap: number | null;
  dividendYield: number | null;
  peTtm: number | null;
  epsTtm: number | null;
  /** FY revenue series (newest first), when upstream provides history. */
  revenueFyHistory: number[] | null;
  sector: string | null;
  industry: string | null;
  floatShares: number | null;
  sharesOutstanding: number | null;
  beta1Y: number | null;
  employees: number | null;
  isin: string | null;
  currency: string | null;
  netIncomeFyHistory: number[] | null;
  /** Aggregate technical rating −1…1 (TradingView `Recommend.All`). */
  recommendAll: number | null;
  /** Moving-average aggregate (TradingView `Recommend.MA`). */
  recommendMovingAverages: number | null;
  /** Oscillator aggregate (TradingView `Recommend.Other`). */
  recommendOscillators: number | null;
  /** TradingView symbol logo slug (S3 SVG). */
  logoid: string | null;
};

export type EgyptScannerRelatedRow = {
  symbol: string;
  name: string;
  close: number;
  changePct: number;
};

type ScannerPayload = {
  totalCount?: number;
  data?: Array<{ s: string; d: unknown[] }>;
  error?: string;
};

function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function parseRevenueHistory(v: unknown): number[] | null {
  if (!Array.isArray(v)) return null;
  const out: number[] = [];
  for (const x of v) {
    const n = num(x);
    if (n != null) out.push(n);
  }
  return out.length ? out : null;
}

function parseProfileRow(row: { s: string; d: unknown[] }): EgyptScannerProfile | null {
  const d = row.d;
  if (!Array.isArray(d) || d.length < PROFILE_COLUMNS.length) return null;
  const id = row.s;
  const symbol = id.includes(':') ? (id.split(':')[1] ?? id) : id;
  const revenue = parseRevenueHistory(d[9]);
  const netIncome = parseRevenueHistory(d[18]);
  return {
    tickerName: str(d[0]) ?? symbol,
    description: str(d[1]),
    close: num(d[2]),
    changePct: num(d[3]),
    volume: num(d[4]) != null ? Math.round(num(d[4])!) : null,
    marketCap: num(d[5]),
    dividendYield: num(d[6]),
    peTtm: num(d[7]),
    epsTtm: num(d[8]),
    revenueFyHistory: revenue,
    sector: str(d[10]),
    industry: str(d[11]),
    floatShares: num(d[12]) != null ? Math.round(num(d[12])!) : null,
    sharesOutstanding: num(d[13]) != null ? Math.round(num(d[13])!) : null,
    beta1Y: num(d[14]),
    employees: num(d[15]) != null ? Math.round(num(d[15])!) : null,
    isin: str(d[16]),
    currency: str(d[17]),
    netIncomeFyHistory: netIncome,
    recommendAll: num(d[19]),
    recommendMovingAverages: num(d[20]),
    recommendOscillators: num(d[21]),
    logoid: str(d[22]),
  };
}

function parseRelatedRow(row: { s: string; d: unknown[] }): EgyptScannerRelatedRow | null {
  const d = row.d;
  if (!Array.isArray(d) || d.length < 4) return null;
  const id = row.s;
  const symbol = id.includes(':') ? (id.split(':')[1] ?? id) : id;
  const close = num(d[1]);
  const ch = num(d[2]);
  if (close == null || ch == null) return null;
  return {
    symbol,
    name: str(d[3]) ?? str(d[0]) ?? symbol,
    close,
    changePct: Math.round(ch * 10000) / 10000,
  };
}

/** Snapshot for one `EGX:CODE` id (matches scanner `s` field). */
export async function scanEgyptSymbolProfile(
  tvId: string,
  signal?: AbortSignal,
): Promise<EgyptScannerProfile | null> {
  return observeConnector('tradingview_scanner_egypt', 'symbol_profile', async () => {
  const res = await fetch(SCAN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://www.tradingview.com',
    },
    body: JSON.stringify({
      symbols: { tickers: [tvId] },
      columns: [...PROFILE_COLUMNS],
      range: [0, 1],
    }),
    signal,
  });
  const body = (await res.json()) as ScannerPayload;
  if (!res.ok || body.error || !Array.isArray(body.data) || body.data.length === 0) {
    return null;
  }
  return parseProfileRow(body.data[0]!);
  });
}

/** Other EGX stocks in the same `industry` (TradingView classification). */
export async function scanEgyptRelatedByIndustry(
  industry: string,
  excludeSymbol: string,
  limit: number,
  signal?: AbortSignal,
): Promise<EgyptScannerRelatedRow[]> {
  return observeConnector('tradingview_scanner_egypt', 'related_by_industry', async () => {
  const ex = excludeSymbol.trim().toUpperCase();
  const res = await fetch(SCAN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://www.tradingview.com',
    },
    body: JSON.stringify({
      filter: [
        { left: 'type', operation: 'equal', right: 'stock' },
        { left: 'industry', operation: 'equal', right: industry },
      ],
      options: { lang: 'en' },
      markets: ['egypt'],
      columns: [...RELATED_COLUMNS],
      sort: { sortBy: 'volume', sortOrder: 'desc' },
      range: [0, Math.min(40, limit * 4)],
    }),
    signal,
  });
  const body = (await res.json()) as ScannerPayload;
  if (!res.ok || body.error || !Array.isArray(body.data)) {
    return [];
  }
  const rows: EgyptScannerRelatedRow[] = [];
  for (const row of body.data) {
    const r = parseRelatedRow(row);
    if (!r || r.symbol.toUpperCase() === ex) continue;
    rows.push(r);
    if (rows.length >= limit) break;
  }
  return rows;
  });
}
