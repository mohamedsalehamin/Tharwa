import { describe, expect, it } from 'vitest';
import { aggregateSectorHeatmap } from '../../src/services/sector-heatmap.js';

describe('aggregateSectorHeatmap', () => {
  it('equal-weights quoted members and skips missing changePct', () => {
    const quotes = new Map<string, number | null>([
      ['COMI', 1.5],
      ['HRHO', -0.5],
      ['SWDY', null],
    ]);
    const cells = aggregateSectorHeatmap(
      [
        {
          code: 'banks',
          titleAr: 'البنوك',
          titleEn: 'Banks',
          sortOrder: 1,
          symbols: ['COMI', 'HRHO', 'MISSING', 'SWDY'],
        },
      ],
      quotes,
    );
    expect(cells).toEqual([
      {
        code: 'banks',
        titleAr: 'البنوك',
        titleEn: 'Banks',
        memberCount: 4,
        quotedCount: 2,
        changePct: 0.5,
      },
    ]);
  });

  it('returns null changePct when no member has a quote', () => {
    const cells = aggregateSectorHeatmap(
      [
        {
          code: 'empty',
          titleAr: 'فارغ',
          titleEn: 'Empty',
          sortOrder: 0,
          symbols: ['ZZZZ'],
        },
      ],
      new Map(),
    );
    expect(cells[0]?.changePct).toBeNull();
    expect(cells[0]?.quotedCount).toBe(0);
  });

  it('keeps sector sortOrder', () => {
    const cells = aggregateSectorHeatmap(
      [
        {
          code: 'b',
          titleAr: 'ب',
          titleEn: 'B',
          sortOrder: 2,
          symbols: ['X'],
        },
        {
          code: 'a',
          titleAr: 'أ',
          titleEn: 'A',
          sortOrder: 1,
          symbols: ['Y'],
        },
      ],
      new Map([
        ['X', 1],
        ['Y', 2],
      ]),
    );
    expect(cells.map((c) => c.code)).toEqual(['a', 'b']);
  });
});
