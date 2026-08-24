import { pctChange } from './net-worth-snapshots.js';
import { inflationIndexForMonth } from './inflation-benchmark.js';
import { masarBenchmarkForMonth } from './masar-benchmark.js';
import { MASAR_DISCLAIMER } from './masar-result.js';
import type { MasarAllocation } from './masar-archetypes.js';

export type IllustrationBenchmarkKey = 'inflation' | 'usd' | 'gold';

export type IllustrationBenchmarkOutcome = 'ahead' | 'behind' | 'flat' | 'unavailable';

export type IllustrationBenchmark = {
  key: IllustrationBenchmarkKey;
  benchmarkChangePct: number | null;
  realDeltaPct: number | null;
  outcome: IllustrationBenchmarkOutcome;
};

export type IllustrationResult = {
  periodStart: string | null;
  periodEnd: string | null;
  mixChangePct: number | null;
  benchmarks: IllustrationBenchmark[];
  sourceLabel: string | null;
  asOf: string | null;
  hasSufficientData: boolean;
  disclaimer: string;
};

const FLAT_EPSILON = 0.05;

function round2(n: number | null): number | null {
  return n == null ? null : Math.round((n + Number.EPSILON) * 100) / 100;
}

function outcomeFromDelta(realDeltaPct: number | null): IllustrationBenchmarkOutcome {
  if (realDeltaPct == null) return 'unavailable';
  if (realDeltaPct > FLAT_EPSILON) return 'ahead';
  if (realDeltaPct < -FLAT_EPSILON) return 'behind';
  return 'flat';
}

function benchmarkRow(
  key: IllustrationBenchmarkKey,
  mixChangePct: number | null,
  startVal: number | null,
  endVal: number | null,
): IllustrationBenchmark {
  const benchmarkChangePct =
    startVal != null && endVal != null ? pctChange(endVal, startVal) : null;
  if (mixChangePct == null || benchmarkChangePct == null) {
    return {
      key,
      benchmarkChangePct: round2(benchmarkChangePct),
      realDeltaPct: null,
      outcome: 'unavailable',
    };
  }
  const realDeltaPct = mixChangePct - benchmarkChangePct;
  return {
    key,
    benchmarkChangePct: round2(benchmarkChangePct),
    realDeltaPct: round2(realDeltaPct),
    outcome: outcomeFromDelta(realDeltaPct),
  };
}

export type IllustrationAnchor = {
  periodMonth: string;
  equityIndex: number | null;
  fixedIncomeIndex: number | null;
  goldEgpPerGram: number | null;
  usdEgp: number | null;
  inflationIndex: number | null;
  sourceLabel: string | null;
  asOf: string | null;
};

/** Weighted mix % change from asset-class index deltas. */
export function computeMixChangePct(
  allocation: MasarAllocation,
  start: IllustrationAnchor,
  end: IllustrationAnchor,
): number | null {
  const weights = [
    { w: allocation.equityPct / 100, s: start.equityIndex, e: end.equityIndex },
    { w: allocation.fixedIncomePct / 100, s: start.fixedIncomeIndex, e: end.fixedIncomeIndex },
    { w: allocation.goldPct / 100, s: start.goldEgpPerGram, e: end.goldEgpPerGram },
  ];
  let total = 0;
  for (const { w, s, e } of weights) {
    if (w === 0) continue;
    if (s == null || e == null) return null;
    const delta = pctChange(e, s);
    if (delta == null) return null;
    total += w * delta;
  }
  return round2(total);
}

export function computeIllustrationFromAnchors(
  allocation: MasarAllocation,
  start: IllustrationAnchor | null,
  end: IllustrationAnchor | null,
  monthCount: number,
): IllustrationResult {
  if (monthCount < 2 || !start || !end) {
    return {
      periodStart: start?.periodMonth ?? null,
      periodEnd: end?.periodMonth ?? null,
      mixChangePct: null,
      benchmarks: [],
      sourceLabel: end?.sourceLabel ?? start?.sourceLabel ?? null,
      asOf: end?.asOf ?? start?.asOf ?? null,
      hasSufficientData: false,
      disclaimer: MASAR_DISCLAIMER,
    };
  }

  const mixChangePct = computeMixChangePct(allocation, start, end);
  return {
    periodStart: start.periodMonth,
    periodEnd: end.periodMonth,
    mixChangePct,
    benchmarks: [
      benchmarkRow('inflation', mixChangePct, start.inflationIndex, end.inflationIndex),
      benchmarkRow('usd', mixChangePct, start.usdEgp, end.usdEgp),
      benchmarkRow('gold', mixChangePct, start.goldEgpPerGram, end.goldEgpPerGram),
    ],
    sourceLabel: end.sourceLabel ?? start.sourceLabel,
    asOf: end.asOf ?? start.asOf,
    hasSufficientData: true,
    disclaimer: MASAR_DISCLAIMER,
  };
}

function monthKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function anchorForMonth(d: Date): Promise<IllustrationAnchor | null> {
  const row = await masarBenchmarkForMonth(d);
  if (!row) return null;
  const inflationIndex = await inflationIndexForMonth(d);
  return {
    periodMonth: monthKey(row.periodMonth),
    equityIndex: row.equityIndex != null ? Number(row.equityIndex) : null,
    fixedIncomeIndex: row.fixedIncomeIndex != null ? Number(row.fixedIncomeIndex) : null,
    goldEgpPerGram: row.goldEgpPerGram != null ? Number(row.goldEgpPerGram) : null,
    usdEgp: row.usdEgp != null ? Number(row.usdEgp) : null,
    inflationIndex,
    sourceLabel: row.sourceLabel,
    asOf: row.asOf ? row.asOf.toISOString() : null,
  };
}

export async function computeMasarIllustration(
  allocation: MasarAllocation,
  months: number,
): Promise<IllustrationResult> {
  const endDate = new Date();
  const startDate = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth() - months, 1));
  const [start, end] = await Promise.all([anchorForMonth(startDate), anchorForMonth(endDate)]);
  return computeIllustrationFromAnchors(allocation, start, end, months);
}
