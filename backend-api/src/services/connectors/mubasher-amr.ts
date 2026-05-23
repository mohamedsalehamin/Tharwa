/** Mubasher Info AMR (corporate calendar) — Egypt. */
import { createHash } from 'node:crypto';
import { observeConnector } from '../../lib/connector-metrics.js';
import {
  CorporateCalendarDividendSubKind,
  CorporateCalendarEventKind,
} from '@prisma/client';

const AR_BASE = 'https://www.mubasher.info/api/1/amr';
const EN_BASE = 'https://english.mubasher.info/api/1/amr';
const PAGE_SIZE = 20;

export type MubasherAmrRow = {
  from: string;
  to: string | null;
  title: string;
  host: { name: string; key: string | null; url: string | null };
  agenda: string | null;
  place: string | null;
  time: string | null;
};

type AmrResponse = {
  rows: MubasherAmrRow[];
  numberOfPages?: number;
  validCriteria?: boolean;
};

export type NormalizedCalendarRow = {
  sourceKey: string;
  symbol: string;
  eventDate: Date;
  eventDateEnd: Date | null;
  kind: CorporateCalendarEventKind;
  dividendSubKind: CorporateCalendarDividendSubKind | null;
  titleAr: string;
  titleEn: string;
  agendaAr: string | null;
  agendaEn: string | null;
  hostNameAr: string | null;
  hostNameEn: string | null;
  placeAr: string | null;
  placeEn: string | null;
  eventTime: string | null;
  raw: Record<string, unknown>;
};

const AR_MONTHS: Record<string, number> = {
  يناير: 1,
  فبراير: 2,
  مارس: 3,
  أبريل: 4,
  ابريل: 4,
  مايو: 5,
  يونيو: 6,
  يوليو: 7,
  أغسطس: 8,
  اغسطس: 8,
  سبتمبر: 9,
  أكتوبر: 10,
  اكتوبر: 10,
  نوفمبر: 11,
  ديسمبر: 12,
};

const EN_MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

/** Parse `24 مايو 2026` or `01 June 2026` → UTC midnight date (calendar day in Cairo). */
export function parseMubasherCalendarDate(raw: string): Date | null {
  const trimmed = raw.trim();
  const parts = trimmed.split(/\s+/);
  if (parts.length < 3) return null;

  const day = Number.parseInt(parts[0]!, 10);
  const year = Number.parseInt(parts[parts.length - 1]!, 10);
  const monthToken = parts.slice(1, -1).join(' ').trim();

  let month =
    AR_MONTHS[monthToken] ??
  EN_MONTHS[monthToken.toLowerCase()] ??
  EN_MONTHS[monthToken.toLowerCase().replace(/\./g, '')];

  if (!month) {
    const enShort = monthToken.slice(0, 3).toLowerCase();
    const shortMap: Record<string, number> = {
      jan: 1,
      feb: 2,
      mar: 3,
      apr: 4,
      may: 5,
      jun: 6,
      jul: 7,
      aug: 8,
      sep: 9,
      oct: 10,
      nov: 11,
      dec: 12,
    };
    month = shortMap[enShort];
  }

  if (!Number.isFinite(day) || !Number.isFinite(year) || !month) return null;

  return new Date(Date.UTC(year, month - 1, day));
}

export function extractEgxSymbolFromHostUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\/markets\/EGX\/stocks\/([A-Za-z0-9._-]+)/i);
  return m?.[1]?.toUpperCase() ?? null;
}

function mapTitleToKind(titleAr: string, titleEn: string): CorporateCalendarEventKind {
  const ar = titleAr.trim();
  const en = titleEn.trim().toLowerCase();
  if (ar.includes('توزيعات الأرباح') || en === 'dividends') return 'dividend';
  if (ar.includes('جمعية عامة غير عادية') || en.includes('extraordinary shareholder')) return 'egm';
  if (ar.includes('جمعية عامة') || en.includes('shareholder meeting')) return 'agm';
  if (ar.includes('أحداث عامة') || en.includes('general company events')) return 'general';
  return 'other';
}

function mapDividendSubKind(agendaAr: string | null, agendaEn: string | null): CorporateCalendarDividendSubKind | null {
  const ar = (agendaAr ?? '').toLowerCase();
  const en = (agendaEn ?? '').toLowerCase();
  if (ar.includes('أحقية') || en.includes('record date')) return 'entitlement';
  if (ar.includes('توزيع الأرباح النقدية') || en.includes('distribution of cash')) return 'payment';
  return 'unspecified';
}

function buildSourceKey(
  symbol: string,
  eventDate: Date,
  kind: CorporateCalendarEventKind,
  agendaAr: string | null,
): string {
  const dateKey = eventDate.toISOString().slice(0, 10);
  const agendaHash = createHash('sha256')
    .update((agendaAr ?? '').trim())
    .digest('hex')
    .slice(0, 12);
  return `${symbol}|${dateKey}|${kind}|${agendaHash}`;
}

async function fetchAmrPage(baseUrl: string, start: number, signal?: AbortSignal): Promise<AmrResponse> {
  const url = new URL(baseUrl);
  url.searchParams.set('country', 'eg');
  url.searchParams.set('size', String(PAGE_SIZE));
  url.searchParams.set('start', String(start));

  const res = await fetch(url, {
    signal,
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Tharwa/1.0 (corporate-calendar-sync)',
    },
  });
  if (!res.ok) {
    throw new Error(`Mubasher AMR HTTP ${res.status} for start=${start}`);
  }
  return (await res.json()) as AmrResponse;
}

async function fetchAllRows(baseUrl: string, signal?: AbortSignal): Promise<MubasherAmrRow[]> {
  const rows: MubasherAmrRow[] = [];
  let start = 0;
  for (;;) {
    const page = await fetchAmrPage(baseUrl, start, signal);
    const batch = page.rows ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    start += PAGE_SIZE;
    if (start > 10_000) break;
  }
  return rows;
}

function findEnglishRow(eventDate: Date, symbol: string, enRows: MubasherAmrRow[]): MubasherAmrRow | undefined {
  const dateKey = eventDate.toISOString().slice(0, 10);
  return enRows.find((en) => {
    const es = extractEgxSymbolFromHostUrl(en.host?.url);
    const ed = parseMubasherCalendarDate(en.from);
    return es === symbol && ed?.toISOString().slice(0, 10) === dateKey;
  });
}

function normalizeRow(ar: MubasherAmrRow, en?: MubasherAmrRow): NormalizedCalendarRow | null {
  const symbol = extractEgxSymbolFromHostUrl(ar.host?.url);
  if (!symbol) return null;

  const eventDate = parseMubasherCalendarDate(ar.from);
  if (!eventDate) return null;

  const eventDateEnd = ar.to ? parseMubasherCalendarDate(ar.to) : null;
  const titleAr = ar.title?.trim() || '—';
  const titleEn = en?.title?.trim() || titleAr;
  const agendaAr = ar.agenda?.trim() || null;
  const agendaEn = en?.agenda?.trim() || agendaAr;
  const kind = mapTitleToKind(titleAr, titleEn);
  const dividendSubKind = kind === 'dividend' ? mapDividendSubKind(agendaAr, agendaEn) : null;

  return {
    sourceKey: buildSourceKey(symbol, eventDate, kind, agendaAr),
    symbol,
    eventDate,
    eventDateEnd,
    kind,
    dividendSubKind,
    titleAr,
    titleEn,
    agendaAr,
    agendaEn,
    hostNameAr: ar.host?.name?.trim() || null,
    hostNameEn: en?.host?.name?.trim() || ar.host?.name?.trim() || null,
    placeAr: ar.place?.trim() || null,
    placeEn: en?.place?.trim() || ar.place?.trim() || null,
    eventTime: ar.time?.trim() || en?.time?.trim() || null,
    raw: { ar, en: en ?? null },
  };
}

/** Fetch and normalize all Egypt AMR rows (Arabic + English). */
export async function fetchMubasherEgxCorporateCalendar(signal?: AbortSignal): Promise<NormalizedCalendarRow[]> {
  return observeConnector('mubasher_amr', 'fetch_eg', async () => {
    const [arRows, enRows] = await Promise.all([
      fetchAllRows(AR_BASE, signal),
      fetchAllRows(EN_BASE, signal),
    ]);

    const out: NormalizedCalendarRow[] = [];
    for (const ar of arRows) {
      const symbol = extractEgxSymbolFromHostUrl(ar.host?.url);
      const eventDate = parseMubasherCalendarDate(ar.from);
      if (!symbol || !eventDate) continue;
      const en = findEnglishRow(eventDate, symbol, enRows);
      const row = normalizeRow(ar, en);
      if (row) out.push(row);
    }
    return out;
  });
}
