/** TradingView public scanner — Egypt (EGX) equities. */

import { observeConnector } from '../../lib/connector-metrics.js';
import { logoUrlFromTvLogoid } from '../../lib/tv-logo.js';

export type EgxMoverList = 'gainers' | 'losers' | 'volume';

const SCAN_URL = 'https://scanner.tradingview.com/egypt/scan';

/** `description` is often Arabic company text when `options.lang` is `ar`. */
const COLUMNS = ['name', 'description', 'close', 'change', 'change_abs', 'volume', 'logoid'] as const;

function textHasArabicScript(s: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(s);
}

export type EgxMoverRow = {
  id: string;
  symbol: string;
  name: string;
  /** Filled from TradingView `description` (Arabic) and/or curated DB `displayNameAr`. */
  nameAr?: string;
  instrumentId?: string;
  /** TradingView S3 SVG when `logoid` is present. */
  logoUrl?: string | null;
  close: number;
  changePct: number;
  changeAbs: number;
  volume: number;
};

type ScannerPayload = {
  totalCount?: number;
  data?: Array<{ s: string; d: unknown[] }>;
};

function sortForList(list: EgxMoverList): { sortBy: string; sortOrder: 'asc' | 'desc' } {
  if (list === 'gainers') return { sortBy: 'change', sortOrder: 'desc' };
  if (list === 'losers') return { sortBy: 'change', sortOrder: 'asc' };
  return { sortBy: 'volume', sortOrder: 'desc' };
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseRow(row: { s: string; d: unknown[] }): EgxMoverRow {
  const [rawName, description, close, change, changeAbs, volume, logoidRaw] = row.d;
  const id = row.s;
  const symbol = id.includes(':') ? (id.split(':')[1] ?? id) : id;
  const sym = symbol.trim();
  const shortName = String(rawName ?? sym).trim();
  const desc = String(description ?? '').trim();
  const descIsAr = textHasArabicScript(desc);
  /** TV `name` is often just the ticker; use Latin `description` as English label when helpful. */
  const nameResolved =
    !descIsAr && shortName.toUpperCase() === sym.toUpperCase() && desc.length > 0 ? desc : shortName;
  /** Arabic company line from scanner when DB has no `instruments` row. */
  const nameArFromScanner = descIsAr ? desc : undefined;
  const logoid = String(logoidRaw ?? '').trim();
  return {
    id,
    symbol: sym,
    name: nameResolved,
    nameAr: nameArFromScanner,
    logoUrl: logoUrlFromTvLogoid(logoid),
    close: Math.round(num(close) * 10000) / 10000,
    changePct: Math.round(num(change) * 10000) / 10000,
    changeAbs: Math.round(num(changeAbs) * 10000) / 10000,
    volume: Math.round(num(volume)),
  };
}

/**
 * EGX movers: gainers (change ↓ sort desc), losers (change ↑ sort asc), volume leaders.
 */
export async function scanEgyptMovers(
  list: EgxMoverList,
  offset: number,
  limit: number,
  signal?: AbortSignal,
): Promise<{ totalCount: number; items: EgxMoverRow[] }> {
  return observeConnector('tradingview_scanner_egypt', `movers_${list}`, async () => {
  const { sortBy, sortOrder } = sortForList(list);
  const res = await fetch(SCAN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://www.tradingview.com',
    },
    body: JSON.stringify({
      filter: [{ left: 'type', operation: 'equal', right: 'stock' }],
      options: { lang: 'ar' },
      markets: ['egypt'],
      symbols: { query: { types: [] } },
      columns: [...COLUMNS],
      sort: { sortBy, sortOrder },
      range: [offset, offset + limit],
    }),
    signal,
  });

  const body = (await res.json()) as ScannerPayload;
  if (!res.ok) {
    throw new Error(`EGX scanner HTTP ${res.status}`);
  }
  if (!Array.isArray(body.data)) {
    throw new Error('EGX scanner invalid payload');
  }

  const totalCount = typeof body.totalCount === 'number' ? body.totalCount : body.data.length;
  const items = body.data.map(parseRow);
  return { totalCount, items };
  });
}

const MARKET_SCAN_COLUMNS = ['name', 'description', 'close', 'change', 'volume', 'logoid'] as const;

function symbolFromScannerId(id: string): string {
  const t = id.trim();
  return t.includes(':') ? (t.split(':')[1] ?? t).trim() : t;
}

export type EgxMarketMergedRow = {
  tvId: string;
  symbol: string;
  /** English (or Latin) company label from scanner `lang: en`. */
  nameEn: string;
  /** Arabic company line from scanner `lang: ar` when available. */
  nameAr?: string;
  close: number;
  changePct: number;
  volume: number;
  logoUrl?: string | null;
};

/**
 * Full EGX equity list with indicative last / change (single merged page, ≤500 names).
 * Runs two scanner requests (`en` + `ar`) and merges rows by ticker for English + Arabic descriptions.
 */
export async function scanEgyptMarketFull(
  signal?: AbortSignal,
): Promise<EgxMarketMergedRow[]> {
  return observeConnector('tradingview_scanner_egypt', 'market_full', async () => {
  const range: [number, number] = [0, 500];
  const bodyBase = {
    filter: [{ left: 'type', operation: 'equal', right: 'stock' }],
    markets: ['egypt'],
    symbols: { query: { types: [] } },
    columns: [...MARKET_SCAN_COLUMNS],
    sort: { sortBy: 'name', sortOrder: 'asc' },
    range,
  } as const;

  const [enRes, arRes] = await Promise.all([
    fetch(SCAN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://www.tradingview.com',
      },
      body: JSON.stringify({ ...bodyBase, options: { lang: 'en' } }),
      signal,
    }),
    fetch(SCAN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://www.tradingview.com',
      },
      body: JSON.stringify({ ...bodyBase, options: { lang: 'ar' } }),
      signal,
    }),
  ]);

  const [enBody, arBody] = (await Promise.all([enRes.json(), arRes.json()])) as ScannerPayload[];
  if (!enRes.ok) {
    throw new Error(`EGX market scanner (en) HTTP ${enRes.status}`);
  }
  if (!arRes.ok) {
    throw new Error(`EGX market scanner (ar) HTTP ${arRes.status}`);
  }
  if (!Array.isArray(enBody.data)) {
    throw new Error('EGX market scanner (en) invalid payload');
  }
  if (!Array.isArray(arBody.data)) {
    throw new Error('EGX market scanner (ar) invalid payload');
  }

  const arBySym = new Map<string, string>();
  for (const row of arBody.data) {
    const sym = symbolFromScannerId(row.s).toUpperCase();
    const desc = String(row.d[1] ?? '').trim();
    if (desc.length > 0 && textHasArabicScript(desc)) {
      arBySym.set(sym, desc);
    }
  }

  return enBody.data.map((row) => {
    const tvId = row.s.trim();
    const sym = symbolFromScannerId(row.s);
    const [rawName, description, close, change, volume, logoidRaw] = row.d;
    const desc = String(description ?? '').trim();
    const short = String(rawName ?? sym).trim();
    const nameEn =
      !textHasArabicScript(desc) && desc.length > 0 ? desc : short.length > 0 ? short : sym;
    const logoid = String(logoidRaw ?? '').trim();
    return {
      tvId,
      symbol: sym,
      nameEn,
      nameAr: arBySym.get(sym.toUpperCase()),
      close: Math.round(num(close) * 10000) / 10000,
      changePct: Math.round(num(change) * 10000) / 10000,
      volume: Math.round(num(volume)),
      logoUrl: logoUrlFromTvLogoid(logoid),
    };
  });
  });
}
