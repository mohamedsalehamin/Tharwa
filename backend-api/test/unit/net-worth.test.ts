import { describe, expect, it } from 'vitest';
import { buildEgpConverter } from '../../src/lib/egp-convert.js';
import { computeNetWorth } from '../../src/services/net-worth.js';
import { pctChange } from '../../src/services/net-worth-snapshots.js';
import type { FxRateItem } from '../../src/services/connectors/fx.js';

const FX: FxRateItem[] = [
  {
    baseCurrency: 'USD',
    quoteCurrency: 'EGP',
    rate: 50,
    changePct: 0,
    asOf: '2026-06-01T00:00:00.000Z',
    quoteCategory: 'official',
    sessionState: 'open',
    isStale: false,
  } as FxRateItem,
];

describe('buildEgpConverter', () => {
  const convert = buildEgpConverter(FX);

  it('returns EGP amount as-is', () => {
    expect(convert(1000, 'EGP')).toEqual({ amountEgp: 1000, asOf: null, isStale: false });
  });

  it('converts a supported foreign currency using EGP-per-unit rate', () => {
    const r = convert(100, 'USD');
    expect(r.amountEgp).toBe(5000);
    expect(r.asOf).toBe('2026-06-01T00:00:00.000Z');
    expect(r.isStale).toBe(false);
  });

  it('flags unresolved currency as stale with null value', () => {
    expect(convert(100, 'JPY')).toEqual({ amountEgp: null, asOf: null, isStale: true });
  });
});

describe('computeNetWorth', () => {
  it('sums assets minus liabilities and classifies derived holdings', () => {
    const r = computeNetWorth(
      [
        { code: 'EGX:COMI', netQuantity: 10, marketValueEgp: 1000, quoteAsOf: '2026-06-01T00:00:00.000Z' },
        { code: 'GOLD_24K_GRAM_EGP', netQuantity: 5, marketValueEgp: 26000, quoteAsOf: '2026-06-01T00:00:00.000Z' },
      ],
      [
        { kind: 'asset', category: 'cash', amountEgp: 50000, asOf: null, isStale: false },
        { kind: 'liability', category: 'loan', amountEgp: 20000, asOf: null, isStale: false },
      ],
    );
    expect(r.assetsEgp).toBe(77000); // 1000 + 26000 + 50000
    expect(r.liabilitiesEgp).toBe(20000);
    expect(r.totalEgp).toBe(57000);
    const cats = r.breakdown.map((b) => b.category);
    expect(cats).toEqual(['equities', 'gold', 'cash', 'loan']);
  });

  it('supports negative net worth when liabilities exceed assets', () => {
    const r = computeNetWorth(
      [],
      [
        { kind: 'asset', category: 'cash', amountEgp: 10000, asOf: null, isStale: false },
        { kind: 'liability', category: 'loan', amountEgp: 30000, asOf: null, isStale: false },
      ],
    );
    expect(r.totalEgp).toBe(-20000);
  });

  it('marks staleness and contributes 0 when a holding has no price', () => {
    const r = computeNetWorth(
      [{ code: 'EGX:HRHO', netQuantity: 3, marketValueEgp: null, quoteAsOf: null }],
      [{ kind: 'asset', category: 'cash', amountEgp: null, asOf: null, isStale: false }],
    );
    expect(r.assetsEgp).toBe(0);
    expect(r.freshness.isStale).toBe(true);
  });

  it('ignores fully-sold (zero quantity) holdings', () => {
    const r = computeNetWorth(
      [{ code: 'EGX:COMI', netQuantity: 0, marketValueEgp: 1000, quoteAsOf: null }],
      [],
    );
    expect(r.totalEgp).toBe(0);
    expect(r.breakdown).toHaveLength(0);
  });
});

describe('pctChange', () => {
  it('computes percentage change vs previous', () => {
    expect(pctChange(110, 100)).toBeCloseTo(10);
    expect(pctChange(90, 100)).toBeCloseTo(-10);
  });

  it('returns null for missing or ~zero previous', () => {
    expect(pctChange(100, null)).toBeNull();
    expect(pctChange(100, 0)).toBeNull();
  });
});
