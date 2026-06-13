/** CalendarLabs EGX market holidays — https://www.calendarlabs.com/egx-market-holidays-{year}/ */
import { observeConnector } from '../../lib/connector-metrics.js';

export type CalendarLabsEgxHolidayRow = {
  dateKey: string;
  nameEn: string;
};

const ROW_RE =
  /<tr class="r\d">[\s\S]*?<span class='pc'>([A-Za-z]+ \d{1,2}, \d{4})<\/span>[\s\S]*?<td><a href="[^"]*">([^<]+)<\/a><\/td>[\s\S]*?<td>([^<]*)<\/td>/g;

const EN_MONTHS: Record<string, number> = {
  Jan: 1,
  Feb: 2,
  Mar: 3,
  Apr: 4,
  May: 5,
  Jun: 6,
  Jul: 7,
  Aug: 8,
  Sep: 9,
  Oct: 10,
  Nov: 11,
  Dec: 12,
};

function parseDisplayDate(raw: string): string | null {
  const m = raw.trim().match(/^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/);
  if (!m) return null;
  const month = EN_MONTHS[m[1]!];
  const day = Number(m[2]);
  const year = Number(m[3]);
  if (!month || !Number.isFinite(day) || !Number.isFinite(year)) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseCalendarLabsEgxHolidayHtml(html: string): CalendarLabsEgxHolidayRow[] {
  const rows: CalendarLabsEgxHolidayRow[] = [];
  const seen = new Set<string>();

  for (const match of html.matchAll(ROW_RE)) {
    const comments = match[3]?.trim() ?? '';
    if (comments && !comments.toLowerCase().includes('full day off')) continue;

    const dateKey = parseDisplayDate(match[1] ?? '');
    const nameEn = match[2]?.trim() ?? '';
    if (!dateKey || !nameEn || seen.has(dateKey)) continue;
    seen.add(dateKey);
    rows.push({ dateKey, nameEn });
  }

  return rows.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

export async function fetchCalendarLabsEgxHolidays(
  year: number,
  signal?: AbortSignal,
): Promise<CalendarLabsEgxHolidayRow[]> {
  return observeConnector('calendarlabs', `egx_holidays_${year}`, async () => {
    const url = `https://www.calendarlabs.com/egx-market-holidays-${year}/`;
    const res = await fetch(url, {
      signal,
      headers: {
        Accept: 'text/html',
        'User-Agent': 'TharwaBackend/1.0 (EGX holiday sync)',
      },
    });
    if (!res.ok) {
      throw new Error(`CalendarLabs EGX holidays ${year}: HTTP ${res.status}`);
    }
    const html = await res.text();
    const rows = parseCalendarLabsEgxHolidayHtml(html);
    if (rows.length === 0) {
      throw new Error(`CalendarLabs EGX holidays ${year}: no rows parsed`);
    }
    return rows;
  });
}
