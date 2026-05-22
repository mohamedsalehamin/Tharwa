import type { ZakatYearType } from './zakat.js';

/** Approximate hawl length (days) — not a precise Hijri calendar conversion. */
export const HAWL_DAYS_HIJRI = 354;
export const HAWL_DAYS_GREGORIAN = 365;

export type ZakatHawlStatus = {
  nisabAttainmentDate: string;
  yearType: ZakatYearType;
  referenceDate: string;
  hawlLengthDays: number;
  daysElapsed: number;
  daysRemaining: number | null;
  hawlComplete: boolean;
  summaryAr: string;
  summaryEn: string;
};

function parseUtcDate(isoDate: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo || dt.getUTCDate() !== d) return null;
  return dt;
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function buildHawlStatus(
  nisabAttainmentDate: string,
  yearType: ZakatYearType,
  referenceDate: Date = new Date(),
): ZakatHawlStatus | null {
  const start = parseUtcDate(nisabAttainmentDate);
  if (!start) return null;

  const ref = new Date(
    Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate()),
  );
  const hawlLengthDays = yearType === 'hijri' ? HAWL_DAYS_HIJRI : HAWL_DAYS_GREGORIAN;
  const msPerDay = 86_400_000;
  const daysElapsed = Math.max(0, Math.floor((ref.getTime() - start.getTime()) / msPerDay));
  const daysRemaining = Math.max(0, hawlLengthDays - daysElapsed);
  const hawlComplete = daysElapsed >= hawlLengthDays;

  let summaryAr: string;
  let summaryEn: string;
  if (hawlComplete) {
    summaryAr = `اكتمل الحول التقريبي (${hawlLengthDays} يومًا منذ ${nisabAttainmentDate}). تحقق شرعًا قبل الأداء.`;
    summaryEn = `Approximate hawl complete (${hawlLengthDays} days since ${nisabAttainmentDate}). Confirm with a scholar before paying.`;
  } else {
    summaryAr = `متبقي تقريبًا ${daysRemaining} يومًا لإكمال الحول (${yearType === 'hijri' ? 'هجري' : 'ميلادي'}).`;
    summaryEn = `About ${daysRemaining} days remain to complete the ${yearType} hawl (estimate).`;
  }

  return {
    nisabAttainmentDate,
    yearType,
    referenceDate: toIsoDate(ref),
    hawlLengthDays,
    daysElapsed,
    daysRemaining: hawlComplete ? 0 : daysRemaining,
    hawlComplete,
    summaryAr,
    summaryEn,
  };
}
