import type { FastifyBaseLogger } from 'fastify';
import type { Redis } from 'ioredis';
import type { Env } from '../config/env.js';
import { DISCLAIMER_COMBINED } from '../i18n/disclaimers.js';
import { getEgpConverter } from '../lib/egp-convert.js';
import { isMetalQuoteInstrumentCode } from './metal-instrument-ref.js';
import { buildPortfolioSummary } from './portfolio.js';
import { listComponents } from './net-worth-components.js';

export const NET_WORTH_DISCLAIMER = `${DISCLAIMER_COMBINED} Self-reported informational estimate — not a valuation, audited statement, or guaranteed outcome.`;

export type NetWorthCategoryKey =
  | 'equities'
  | 'gold'
  | 'cash'
  | 'certificate'
  | 'real_estate'
  | 'other_asset'
  | 'loan'
  | 'other_liability';

export type NetWorthSubtotal = {
  category: NetWorthCategoryKey;
  kind: 'asset' | 'liability';
  totalEgp: number;
};

export type NetWorthSummary = {
  totalEgp: number;
  assetsEgp: number;
  liabilitiesEgp: number;
  breakdown: NetWorthSubtotal[];
  freshness: { asOf: string | null; isStale: boolean };
  disclaimer: string;
};

export type NetWorthCtx = { env: Env; redis: Redis; log: FastifyBaseLogger };

/** Derived holding input (from the trade-journal-backed portfolio), valued in EGP. */
export type DerivedHoldingInput = {
  code: string;
  netQuantity: number;
  marketValueEgp: number | null;
  quoteAsOf: string | null;
};

/** Manual component already converted to EGP. */
export type ManualComponentValued = {
  kind: 'asset' | 'liability';
  category: Exclude<NetWorthCategoryKey, 'equities' | 'gold'>;
  amountEgp: number | null;
  asOf: string | null;
  isStale: boolean;
};

function olderAsOf(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return new Date(a).getTime() < new Date(b).getTime() ? a : b;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const MANUAL_ORDER: NetWorthCategoryKey[] = [
  'cash',
  'certificate',
  'real_estate',
  'other_asset',
  'loan',
  'other_liability',
];

/**
 * Pure aggregation: derived holdings + manual components − liabilities → EGP net worth.
 * Practice/sim data is never part of the inputs (callers must not include it).
 */
export function computeNetWorth(
  derived: DerivedHoldingInput[],
  manual: ManualComponentValued[],
): Omit<NetWorthSummary, 'disclaimer'> {
  let equitiesEgp = 0;
  let goldEgp = 0;
  let asOf: string | null = null;
  let isStale = false;

  for (const p of derived) {
    if (p.netQuantity <= 1e-12) continue;
    if (p.marketValueEgp == null || !Number.isFinite(p.marketValueEgp)) {
      isStale = true;
      continue;
    }
    asOf = olderAsOf(asOf, p.quoteAsOf);
    if (isMetalQuoteInstrumentCode(p.code)) goldEgp += p.marketValueEgp;
    else equitiesEgp += p.marketValueEgp;
  }

  const manualTotals = new Map<NetWorthCategoryKey, { kind: 'asset' | 'liability'; total: number }>();
  for (const c of manual) {
    if (c.amountEgp == null) {
      isStale = true;
      continue;
    }
    if (c.isStale) isStale = true;
    asOf = olderAsOf(asOf, c.asOf);
    const cell = manualTotals.get(c.category) ?? { kind: c.kind, total: 0 };
    cell.total += c.amountEgp;
    manualTotals.set(c.category, cell);
  }

  const breakdown: NetWorthSubtotal[] = [];
  if (equitiesEgp > 0) breakdown.push({ category: 'equities', kind: 'asset', totalEgp: round2(equitiesEgp) });
  if (goldEgp > 0) breakdown.push({ category: 'gold', kind: 'asset', totalEgp: round2(goldEgp) });
  for (const key of MANUAL_ORDER) {
    const cell = manualTotals.get(key);
    if (cell) breakdown.push({ category: key, kind: cell.kind, totalEgp: round2(cell.total) });
  }

  let assetsEgp = equitiesEgp + goldEgp;
  let liabilitiesEgp = 0;
  for (const cell of manualTotals.values()) {
    if (cell.kind === 'asset') assetsEgp += cell.total;
    else liabilitiesEgp += cell.total;
  }

  return {
    totalEgp: round2(assetsEgp - liabilitiesEgp),
    assetsEgp: round2(assetsEgp),
    liabilitiesEgp: round2(liabilitiesEgp),
    breakdown,
    freshness: { asOf, isStale },
  };
}

/**
 * Aggregate live net worth = derived holdings (equities + metals from the trade journal,
 * valued at indicative prices) + manual components − liabilities. Never reads SimAccount/SimTrade.
 */
export async function buildNetWorthSummary(
  consumerUserId: string,
  ctx: NetWorthCtx,
): Promise<NetWorthSummary> {
  const [{ positions }, components, { convert }] = await Promise.all([
    buildPortfolioSummary(consumerUserId, ctx),
    listComponents(consumerUserId),
    getEgpConverter(ctx.env, ctx.redis, ctx.log),
  ]);

  const derived: DerivedHoldingInput[] = positions.map((p) => ({
    code: p.code,
    netQuantity: p.netQuantity,
    marketValueEgp: p.marketValue,
    quoteAsOf: p.quoteAsOf,
  }));

  const manual: ManualComponentValued[] = components.map((c) => {
    const conv = convert(Number(c.amount), c.currency);
    return {
      kind: c.kind,
      category: c.category as ManualComponentValued['category'],
      amountEgp: conv.amountEgp,
      asOf: conv.asOf,
      isStale: conv.isStale,
    };
  });

  return { ...computeNetWorth(derived, manual), disclaimer: NET_WORTH_DISCLAIMER };
}
