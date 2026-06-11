import { prisma } from '../lib/prisma.js';
import { DISCLAIMER_COMBINED } from '../i18n/disclaimers.js';
import { pctChange } from './net-worth-snapshots.js';

export const REAL_RETURN_DISCLAIMER = `${DISCLAIMER_COMBINED} Past changes vs benchmarks are descriptive only and do not predict future results.`;

export type BenchmarkKey = 'inflation' | 'usd' | 'gold';
export type BenchmarkOutcome = 'ahead' | 'behind' | 'flat' | 'unavailable';

export type BenchmarkResult = {
  key: BenchmarkKey;
  benchmarkChangePct: number | null;
  realDeltaPct: number | null;
  outcome: BenchmarkOutcome;
};

export type RealReturnResult = {
  periodStart: string | null;
  periodEnd: string | null;
  nominalChangePct: number | null;
  benchmarks: BenchmarkResult[];
  hasSufficientData: boolean;
  disclaimer: string;
};

export type SnapshotAnchor = {
  periodMonth: string;
  totalEgp: number;
  usdEgpRate: number | null;
  goldGramEgp: number | null;
  inflationIndex: number | null;
};

const FLAT_EPSILON = 0.05; // percentage points

function round2(n: number | null): number | null {
  return n == null ? null : Math.round((n + Number.EPSILON) * 100) / 100;
}

function benchmark(
  key: BenchmarkKey,
  nominalChangePct: number | null,
  startVal: number | null,
  endVal: number | null,
): BenchmarkResult {
  const benchmarkChangePct = startVal != null && endVal != null ? pctChange(endVal, startVal) : null;
  if (nominalChangePct == null || benchmarkChangePct == null) {
    return { key, benchmarkChangePct: round2(benchmarkChangePct), realDeltaPct: null, outcome: 'unavailable' };
  }
  const realDeltaPct = nominalChangePct - benchmarkChangePct;
  const outcome: BenchmarkOutcome =
    realDeltaPct > FLAT_EPSILON ? 'ahead' : realDeltaPct < -FLAT_EPSILON ? 'behind' : 'flat';
  return { key, benchmarkChangePct: round2(benchmarkChangePct), realDeltaPct: round2(realDeltaPct), outcome };
}

/**
 * Pure real-return comparison. Net worth %Δ over the period vs inflation / USD / gold %Δ.
 * `hasSufficientData` is false when fewer than two snapshots exist in the period.
 */
export function computeRealReturn(
  start: SnapshotAnchor | null,
  end: SnapshotAnchor | null,
  snapshotCount: number,
): RealReturnResult {
  if (snapshotCount < 2 || !start || !end) {
    return {
      periodStart: start?.periodMonth ?? null,
      periodEnd: end?.periodMonth ?? null,
      nominalChangePct: null,
      benchmarks: [],
      hasSufficientData: false,
      disclaimer: REAL_RETURN_DISCLAIMER,
    };
  }

  const nominalChangePct = pctChange(end.totalEgp, start.totalEgp);
  return {
    periodStart: start.periodMonth,
    periodEnd: end.periodMonth,
    nominalChangePct: round2(nominalChangePct),
    benchmarks: [
      benchmark('inflation', nominalChangePct, start.inflationIndex, end.inflationIndex),
      benchmark('usd', nominalChangePct, start.usdEgpRate, end.usdEgpRate),
      benchmark('gold', nominalChangePct, start.goldGramEgp, end.goldGramEgp),
    ],
    hasSufficientData: true,
    disclaimer: REAL_RETURN_DISCLAIMER,
  };
}

function toAnchor(row: {
  periodMonth: Date;
  totalEgp: unknown;
  usdEgpRate: unknown;
  goldGramEgp: unknown;
  inflationIndex: unknown;
}): SnapshotAnchor {
  const num = (v: unknown): number | null => (v == null ? null : Number(v));
  return {
    periodMonth: row.periodMonth.toISOString().slice(0, 10),
    totalEgp: Number(row.totalEgp),
    usdEgpRate: num(row.usdEgpRate),
    goldGramEgp: num(row.goldGramEgp),
    inflationIndex: num(row.inflationIndex),
  };
}

export async function buildRealReturn(consumerUserId: string, months: number): Promise<RealReturnResult> {
  const rows = await prisma.netWorthSnapshot.findMany({
    where: { consumerUserId },
    orderBy: { periodMonth: 'desc' },
    take: months,
    select: { periodMonth: true, totalEgp: true, usdEgpRate: true, goldGramEgp: true, inflationIndex: true },
  });

  if (rows.length < 2) {
    const only = rows[0] ? toAnchor(rows[0]) : null;
    return computeRealReturn(only, only, rows.length);
  }

  const end = toAnchor(rows[0]!); // newest
  const start = toAnchor(rows[rows.length - 1]!); // oldest in window
  return computeRealReturn(start, end, rows.length);
}
