import type { FastifyBaseLogger } from 'fastify';
import type { Redis } from 'ioredis';
import type { Env } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import type { MetalItem } from './connectors/metals.js';
import { getMetalsCached } from './quotes.js';
import { buildPortfolioSummary, type PortfolioQuoteCtx } from './portfolio.js';
import { buildHawlStatus, type ZakatHawlStatus } from './zakat-hawl.js';

/** Nisab basis per common Egyptian retail practice (85 g gold, 21 karat). */
export const NISAB_GOLD_GRAMS = 85;
export const NISAB_GOLD_KARAT = 21 as const;
export const ZAKAT_RATE_HIJRI = 0.025;
export const ZAKAT_RATE_GREGORIAN = 0.02577;

export type ZakatYearType = 'hijri' | 'gregorian';

export type ZakatGoldPurpose = 'investment' | 'personal_jewelry';
export type ZakatEquitiesPurpose = 'trading' | 'long_term_investment';

export type ZakatGoldInput = {
  mode: 'egp' | 'grams';
  amount: number;
  karat?: 18 | 21 | 24;
  purpose?: ZakatGoldPurpose;
};

export type ZakatSilverInput = {
  mode: 'egp' | 'grams';
  amount: number;
};

export type ZakatComputeInput = {
  yearType: ZakatYearType;
  nisabAttainmentDate?: string;
  cashEgp: number;
  equitiesEgp: number;
  equitiesPurpose?: ZakatEquitiesPurpose;
  gold?: ZakatGoldInput;
  silver?: ZakatSilverInput;
  bankCertificatesEgp: number;
  realEstateEgp: number;
  commercialAssetsEgp: number;
  receivablesEgp: number;
  debtsOwedEgp: number;
};

export type ZakatNisabSnapshot = {
  disclaimer: string;
  methodologyNote: string;
  nisabGoldGrams: number;
  nisabGoldKarat: number;
  gold21GramPriceEgp: number;
  nisabEgp: number;
  asOf: string;
  isStale: boolean;
  rates: { hijri: number; gregorian: number };
};

export type ZakatPurposeNote = {
  id: string;
  messageAr: string;
  messageEn: string;
};

export type ZakatComputeResult = {
  disclaimer: string;
  methodologyNote: string;
  yearType: ZakatYearType;
  rate: number;
  nisabEgp: number;
  nisabAttainmentDate: string | null;
  breakdown: {
    cashEgp: number;
    equitiesEgp: number;
    goldEgp: number;
    goldGrossEgp: number;
    silverEgp: number;
    bankCertificatesEgp: number;
    realEstateEgp: number;
    commercialAssetsEgp: number;
    receivablesEgp: number;
    grossAssetsEgp: number;
    debtsOwedEgp: number;
    netWealthEgp: number;
  };
  purposeNotes: ZakatPurposeNote[];
  aboveNisab: boolean;
  zakatDueEgp: number;
  hawlReminder: string;
  hawl: ZakatHawlStatus | null;
};

const GOLD_PURPOSE_FRACTION: Record<ZakatGoldPurpose, number> = {
  investment: 1,
  personal_jewelry: 0,
};

export function findGoldGramPriceEgp(
  items: MetalItem[],
  karat: 18 | 21 | 24,
): { priceEgp: number; asOf: string; isStale: boolean } | null {
  const row = items.find((m) => m.metal === 'gold' && m.unit === 'gram' && m.karat === karat);
  if (!row || !Number.isFinite(row.amountEgp)) return null;
  return { priceEgp: row.amountEgp, asOf: row.asOf, isStale: row.isStale };
}

export function buildNisabFromMetals(items: MetalItem[]): ZakatNisabSnapshot | null {
  const gold21 = findGoldGramPriceEgp(items, NISAB_GOLD_KARAT);
  if (!gold21) return null;
  const nisabEgp = round2(NISAB_GOLD_GRAMS * gold21.priceEgp);
  return {
    disclaimer: ZAKAT_DISCLAIMER,
    methodologyNote: ZAKAT_METHODOLOGY_NOTE,
    nisabGoldGrams: NISAB_GOLD_GRAMS,
    nisabGoldKarat: NISAB_GOLD_KARAT,
    gold21GramPriceEgp: round2(gold21.priceEgp),
    nisabEgp,
    asOf: gold21.asOf,
    isStale: gold21.isStale,
    rates: { hijri: ZAKAT_RATE_HIJRI, gregorian: ZAKAT_RATE_GREGORIAN },
  };
}

export function resolveGoldGrossEgp(gold: ZakatGoldInput | undefined, items: MetalItem[]): number {
  if (!gold || gold.amount <= 0) return 0;
  if (gold.mode === 'egp') return round2(gold.amount);
  const karat = gold.karat ?? NISAB_GOLD_KARAT;
  const row = findGoldGramPriceEgp(items, karat);
  if (!row) {
    throw new AppError('UPSTREAM', `Gold ${karat}k gram price unavailable`, 503);
  }
  return round2(gold.amount * row.priceEgp);
}

export function resolveGoldZakatableEgp(gold: ZakatGoldInput | undefined, items: MetalItem[]): number {
  const gross = resolveGoldGrossEgp(gold, items);
  if (gross <= 0) return 0;
  const purpose = gold?.purpose ?? 'investment';
  const fraction = GOLD_PURPOSE_FRACTION[purpose];
  return round2(gross * fraction);
}

export function resolveSilverValueEgp(
  silver: ZakatSilverInput | undefined,
  items: MetalItem[],
): number {
  if (!silver || silver.amount <= 0) return 0;
  if (silver.mode === 'egp') return round2(silver.amount);
  const row = items.find((m) => m.metal === 'silver' && m.unit === 'gram');
  if (!row) {
    throw new AppError('UPSTREAM', 'Silver gram price unavailable', 503);
  }
  return round2(silver.amount * row.amountEgp);
}

function buildPurposeNotes(input: ZakatComputeInput, goldGross: number, goldZakatable: number): ZakatPurposeNote[] {
  const notes: ZakatPurposeNote[] = [];

  if (input.gold && goldGross > 0) {
    const purpose = input.gold.purpose ?? 'investment';
    if (purpose === 'personal_jewelry') {
      notes.push({
        id: 'gold_jewelry_excluded',
        messageAr: 'المجوهرات الشخصية: لم تُدخل في المجموع الزكوي (٠٪ في هذا التقدير).',
        messageEn: 'Personal jewelry: excluded from zakatable total (0% in this estimate).',
      });
    } else {
      notes.push({
        id: 'gold_investment_full',
        messageAr: 'ذهب الاستثمار/التجارة: دخل كامل القيمة في الحساب.',
        messageEn: 'Investment/trade gold: full value included.',
      });
    }
  }

  if (input.equitiesEgp > 0) {
    const ep = input.equitiesPurpose ?? 'long_term_investment';
    if (ep === 'trading') {
      notes.push({
        id: 'equities_trading',
        messageAr: 'أسهم للتداول: قيمة السوق كاملة — راجع عالمًا إن كانت للبيع فقط.',
        messageEn: 'Trading equities: full market value — consult a scholar if held only for resale.',
      });
    } else {
      notes.push({
        id: 'equities_long_term',
        messageAr: 'استثمار طويل الأجل: قيمة السوق كاملة في هذا التقدير.',
        messageEn: 'Long-term investment: full market value in this estimate.',
      });
    }
  }

  if (input.realEstateEgp > 0) {
    notes.push({
      id: 'real_estate_manual',
      messageAr: 'العقار: أدخلت القيمة يدويًا — تأكد أنها للاستثمار/الإيجار وليس مسكنًا شخصيًا.',
      messageEn: 'Real estate: manual entry — ensure it is investment/rental, not personal residence.',
    });
  }

  return notes;
}

export function computeZakat(
  input: ZakatComputeInput,
  items: MetalItem[],
  nisab: ZakatNisabSnapshot,
): ZakatComputeResult {
  const rate = input.yearType === 'hijri' ? ZAKAT_RATE_HIJRI : ZAKAT_RATE_GREGORIAN;
  const goldGrossEgp = resolveGoldGrossEgp(input.gold, items);
  const goldEgp = resolveGoldZakatableEgp(input.gold, items);
  const silverEgp = resolveSilverValueEgp(input.silver, items);
  const cashEgp = round2(input.cashEgp);
  const equitiesEgp = round2(input.equitiesEgp);
  const bankCertificatesEgp = round2(input.bankCertificatesEgp);
  const realEstateEgp = round2(input.realEstateEgp);
  const commercialAssetsEgp = round2(input.commercialAssetsEgp);
  const receivablesEgp = round2(input.receivablesEgp);
  const debtsOwedEgp = round2(input.debtsOwedEgp);

  const grossAssetsEgp = round2(
    cashEgp +
      equitiesEgp +
      goldEgp +
      silverEgp +
      bankCertificatesEgp +
      realEstateEgp +
      commercialAssetsEgp +
      receivablesEgp,
  );
  const netWealthEgp = round2(Math.max(0, grossAssetsEgp - debtsOwedEgp));
  const aboveNisab = netWealthEgp >= nisab.nisabEgp - 1e-6;
  const zakatDueEgp = aboveNisab ? round2(netWealthEgp * rate) : 0;

  const hawl =
    input.nisabAttainmentDate != null
      ? buildHawlStatus(input.nisabAttainmentDate, input.yearType)
      : null;

  const purposeNotes = buildPurposeNotes(input, goldGrossEgp, goldEgp);

  return {
    disclaimer: ZAKAT_DISCLAIMER,
    methodologyNote: ZAKAT_METHODOLOGY_NOTE,
    yearType: input.yearType,
    rate,
    nisabEgp: nisab.nisabEgp,
    nisabAttainmentDate: input.nisabAttainmentDate ?? null,
    breakdown: {
      cashEgp,
      equitiesEgp,
      goldEgp,
      goldGrossEgp,
      silverEgp,
      bankCertificatesEgp,
      realEstateEgp,
      commercialAssetsEgp,
      receivablesEgp,
      grossAssetsEgp,
      debtsOwedEgp,
      netWealthEgp,
    },
    purposeNotes,
    aboveNisab,
    zakatDueEgp,
    hawlReminder: hawl
      ? `${hawl.summaryAr} | ${hawl.summaryEn}`
      : HAWL_REMINDER_NO_DATE,
    hawl,
  };
}

export async function loadZakatNisab(
  env: Env,
  redis: Redis,
  log: FastifyBaseLogger,
): Promise<ZakatNisabSnapshot> {
  const { items } = await getMetalsCached(env, redis, log);
  const nisab = buildNisabFromMetals(items);
  if (!nisab) {
    throw new AppError('UPSTREAM', 'Gold 21k price unavailable for nisab', 503);
  }
  return nisab;
}

export type ZakatPrefillLine = {
  instrumentId: string;
  code: string;
  displayNameEn: string;
  marketValueEgp: number;
};

export async function buildZakatPrefill(
  consumerUserId: string,
  quoteCtx: PortfolioQuoteCtx,
): Promise<{ disclaimer: string; equities: ZakatPrefillLine[]; equitiesTotalEgp: number }> {
  const summary = await buildPortfolioSummary(consumerUserId, quoteCtx);
  const equities: ZakatPrefillLine[] = [];
  let total = 0;
  for (const pos of summary.positions) {
    const mv = pos.marketValue ?? 0;
    if (mv <= 0) continue;
    equities.push({
      instrumentId: pos.instrumentId,
      code: pos.code,
      displayNameEn: pos.displayNameEn,
      marketValueEgp: round2(mv),
    });
    total += mv;
  }
  return {
    disclaimer: summary.disclaimer,
    equities,
    equitiesTotalEgp: round2(total),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export const ZAKAT_DISCLAIMER =
  'حاسبة الزكاة للتقدير فقط وليست فتوى أو استشارة شرعية. تحقق من أهلية الحول والنصاب مع عالم مختص. | Zakat calculator is an estimate only; not a religious ruling. Confirm nisab and hawl with a qualified scholar.';

export const ZAKAT_METHODOLOGY_NOTE =
  'النصاب: ٨٥ جرام ذهب عيار ٢١. الزكاة ٢٫٥٪ (هجري) أو ٢٫٥٧٧٪ (ميلادي). راجع منهجية الحاسبة في التطبيق. | Nisab: 85g of 21k gold. Zakat 2.5% (Hijri) or 2.577% (Gregorian). See in-app methodology.';

const HAWL_REMINDER_NO_DATE =
  'أدخل تاريخ بلوغ النصاب لعرض عدّاد الحول التقريبي. | Enter nisab attainment date for an approximate hawl countdown.';
