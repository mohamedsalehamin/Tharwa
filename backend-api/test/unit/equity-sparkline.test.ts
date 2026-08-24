import { describe, expect, it } from 'vitest';
import {
  downsampleSeries,
  sparklineFromPoints,
  sparklineMapFromBars,
  type HistoryPoint,
} from '../../src/services/curated-equities.js';

function point(t: string, c: number): HistoryPoint {
  return { t, o: c, h: c, l: c, c, v: null };
}

describe('downsampleSeries', () => {
  it('returns the series unchanged when within the cap', () => {
    expect(downsampleSeries([1, 2, 3], 60)).toEqual([1, 2, 3]);
  });

  it('always keeps the first and last value when downsampling', () => {
    const values = Array.from({ length: 100 }, (_, i) => i);
    const out = downsampleSeries(values, 10);
    expect(out).toHaveLength(10);
    expect(out[0]).toBe(0);
    expect(out[out.length - 1]).toBe(99);
  });
});

describe('sparklineFromPoints', () => {
  it('extracts closes, computes change, and reports the latest timestamp', () => {
    const points = [
      point('2026-06-01T00:00:00.000Z', 100),
      point('2026-06-02T00:00:00.000Z', 110),
      point('2026-06-03T00:00:00.000Z', 120),
    ];
    const spark = sparklineFromPoints('COMI', '1m', points);
    expect(spark.closes).toEqual([100, 110, 120]);
    expect(spark.changePct).toBe(20);
    expect(spark.asOf).toBe('2026-06-03T00:00:00.000Z');
    expect(spark.isStale).toBe(false);
  });

  it('drops non-finite closes', () => {
    const points = [
      point('2026-06-01T00:00:00.000Z', Number.NaN),
      point('2026-06-02T00:00:00.000Z', 50),
    ];
    const spark = sparklineFromPoints('HRHO', '1w', points);
    expect(spark.closes).toEqual([50]);
  });

  it('marks an empty series as stale with null change', () => {
    const spark = sparklineFromPoints('SWDY', '1d', []);
    expect(spark.closes).toEqual([]);
    expect(spark.isStale).toBe(true);
    expect(spark.changePct).toBeNull();
    expect(spark.asOf).toBeNull();
  });
});

describe('sparklineMapFromBars', () => {
  it('groups closes per instrument preserving order', () => {
    const map = sparklineMapFromBars([
      { instrumentId: 'a', close: 10 },
      { instrumentId: 'b', close: 5 },
      { instrumentId: 'a', close: 12 },
      { instrumentId: 'b', close: 6 },
    ]);
    expect(map.get('a')).toEqual([10, 12]);
    expect(map.get('b')).toEqual([5, 6]);
  });

  it('omits instruments with fewer than two finite closes', () => {
    const map = sparklineMapFromBars([
      { instrumentId: 'a', close: 10 },
      { instrumentId: 'b', close: Number.NaN },
      { instrumentId: 'b', close: 6 },
    ]);
    expect(map.has('a')).toBe(false);
    expect(map.has('b')).toBe(false);
  });
});
