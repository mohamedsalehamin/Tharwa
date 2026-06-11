import { describe, expect, it } from 'vitest';
import { computeRealReturn, type SnapshotAnchor } from '../../src/services/real-return.js';

function anchor(month: string, total: number, partial: Partial<SnapshotAnchor> = {}): SnapshotAnchor {
  return {
    periodMonth: month,
    totalEgp: total,
    usdEgpRate: null,
    goldGramEgp: null,
    inflationIndex: null,
    ...partial,
  };
}

describe('computeRealReturn', () => {
  it('flags insufficient data with fewer than two snapshots', () => {
    const r = computeRealReturn(anchor('2026-06-01', 1000), anchor('2026-06-01', 1000), 1);
    expect(r.hasSufficientData).toBe(false);
    expect(r.nominalChangePct).toBeNull();
    expect(r.benchmarks).toHaveLength(0);
  });

  it('computes nominal change and ahead/behind/flat vs benchmarks', () => {
    // net worth +20%, inflation +10% (ahead), usd +20% (flat), gold +30% (behind)
    const start = anchor('2026-01-01', 100000, { inflationIndex: 100, usdEgpRate: 50, goldGramEgp: 5000 });
    const end = anchor('2026-12-01', 120000, { inflationIndex: 110, usdEgpRate: 60, goldGramEgp: 6500 });
    const r = computeRealReturn(start, end, 12);

    expect(r.hasSufficientData).toBe(true);
    expect(r.nominalChangePct).toBeCloseTo(20);

    const byKey = Object.fromEntries(r.benchmarks.map((b) => [b.key, b]));
    expect(byKey.inflation.outcome).toBe('ahead'); // 20 - 10 = +10
    expect(byKey.usd.outcome).toBe('flat'); // 20 - 20 = 0
    expect(byKey.gold.outcome).toBe('behind'); // 20 - 30 = -10
    expect(byKey.gold.realDeltaPct).toBeCloseTo(-10);
  });

  it('returns unavailable for a benchmark missing its anchor', () => {
    const start = anchor('2026-01-01', 100000, { usdEgpRate: 50 });
    const end = anchor('2026-12-01', 120000, { usdEgpRate: 60 }); // inflation + gold null
    const r = computeRealReturn(start, end, 12);
    const byKey = Object.fromEntries(r.benchmarks.map((b) => [b.key, b]));
    expect(byKey.inflation.outcome).toBe('unavailable');
    expect(byKey.inflation.benchmarkChangePct).toBeNull();
    expect(byKey.usd.outcome).toBe('flat');
  });
});
