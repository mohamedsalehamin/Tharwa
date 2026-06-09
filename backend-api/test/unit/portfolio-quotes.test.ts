import { describe, expect, it } from 'vitest';
import { METAL_QUOTE_INSTRUMENT_CODES } from '../../src/lib/metal-instrument-codes.js';
import { metalPriceFromItems } from '../../src/services/portfolio-quotes.js';
import type { MetalItem } from '../../src/services/connectors/metals.js';

const gold21: MetalItem = {
  metal: 'gold',
  unit: 'gram',
  karat: 21,
  amountEgp: 4120,
  asOf: '2026-06-10T10:00:00.000Z',
  quoteCategory: 'indicative',
  sessionState: 'unknown',
  isStale: false,
};

describe('metalPriceFromItems', () => {
  it('returns price for matching metal instrument code', () => {
    const result = metalPriceFromItems([gold21], METAL_QUOTE_INSTRUMENT_CODES.GOLD_21K_GRAM);
    expect(result).toEqual({ last: 4120, asOf: '2026-06-10T10:00:00.000Z' });
  });

  it('returns null when code is not a metal quote instrument', () => {
    expect(metalPriceFromItems([gold21], 'COMI')).toBeNull();
  });

  it('returns null when metal row is missing from items', () => {
    expect(
      metalPriceFromItems([], METAL_QUOTE_INSTRUMENT_CODES.GOLD_21K_GRAM),
    ).toBeNull();
  });
});
