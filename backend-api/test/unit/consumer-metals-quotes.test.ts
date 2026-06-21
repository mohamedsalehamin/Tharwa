import { describe, expect, it } from 'vitest';
import type { MetalItem } from '../../src/services/connectors/metals.js';
import { extractGoldSocialPrices } from '../../src/services/consumer-metals-quotes.js';

const base = {
  asOf: '2026-06-20T10:00:00.000Z',
  quoteCategory: 'indicative' as const,
  sessionState: 'unknown' as const,
  isStale: false,
};

function gram(karat: 18 | 21 | 24, amountEgp: number): MetalItem {
  return { ...base, metal: 'gold', unit: 'gram', karat, amountEgp };
}

describe('extractGoldSocialPrices', () => {
  it('reads the same amountEgp fields the mobile app displays', () => {
    const items: MetalItem[] = [
      gram(24, 4705),
      gram(21, 4120),
      gram(18, 3520),
      { ...base, metal: 'gold', unit: 'gold_pound', karat: 21, amountEgp: 32960 },
      { ...base, metal: 'gold', unit: 'troy_ounce', karat: null, amountEgp: 285_400 },
    ];

    expect(extractGoldSocialPrices(items)).toEqual({
      gold18: 3520,
      gold21: 4120,
      gold24: 4705,
      goldOunce: 285_400,
      goldPound: 32960,
    });
  });

  it('derives gold pound from 21k gram when the API row is missing', () => {
    expect(extractGoldSocialPrices([gram(21, 4000)]).goldPound).toBe(32000);
  });
});
