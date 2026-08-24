import { describe, expect, it } from 'vitest';
import {
  computeIllustrationFromAnchors,
  computeMixChangePct,
  type IllustrationAnchor,
} from '../../src/services/masar-illustration.js';

function anchor(month: string, partial: Partial<IllustrationAnchor> = {}): IllustrationAnchor {
  return {
    periodMonth: month,
    equityIndex: 100,
    fixedIncomeIndex: 100,
    goldEgpPerGram: 1000,
    usdEgp: 50,
    inflationIndex: 100,
    sourceLabel: 'test',
    asOf: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('masar illustration', () => {
  const allocation = { equityPct: 70, fixedIncomePct: 20, goldPct: 10 };

  it('flags insufficient data with fewer than two months', () => {
    const r = computeIllustrationFromAnchors(
      allocation,
      anchor('2021-06-01'),
      anchor('2026-06-01'),
      1,
    );
    expect(r.hasSufficientData).toBe(false);
    expect(r.mixChangePct).toBeNull();
  });

  it('computes weighted mix change and ahead/behind vs benchmarks', () => {
    const start = anchor('2021-06-01');
    const end = anchor('2026-06-01', {
      equityIndex: 200,
      fixedIncomeIndex: 150,
      goldEgpPerGram: 1500,
      usdEgp: 75,
      inflationIndex: 130,
    });
    const mixPct = computeMixChangePct(allocation, start, end);
    expect(mixPct).not.toBeNull();

    const r = computeIllustrationFromAnchors(allocation, start, end, 60);
    expect(r.hasSufficientData).toBe(true);
    expect(r.mixChangePct).not.toBeNull();

    const byKey = Object.fromEntries(r.benchmarks.map((b) => [b.key, b]));
    expect(byKey.inflation.outcome).not.toBe('unavailable');
    expect(byKey.usd.outcome).not.toBe('unavailable');
    expect(byKey.gold.outcome).not.toBe('unavailable');
  });

  it('returns unavailable when an index is missing', () => {
    const start = anchor('2021-06-01', { usdEgp: null });
    const end = anchor('2026-06-01');
    const r = computeIllustrationFromAnchors(allocation, start, end, 60);
    const usd = r.benchmarks.find((b) => b.key === 'usd');
    expect(usd?.outcome).toBe('unavailable');
  });
});
