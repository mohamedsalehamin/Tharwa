import { describe, expect, it, vi } from 'vitest';
import {
  EGYPT_GOLD_POUND_GRAM_WEIGHT,
  goldPoundPriceEgp,
  metalItemsFromEgyptParsed,
} from '../../src/services/connectors/metals.js';

vi.mock('../../src/lib/prisma.js', () => ({
  prisma: {
    instrument: { findFirst: vi.fn().mockResolvedValue(null) },
    metalKaratRule: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

describe('gold pound metal row', () => {
  it('uses channel gold_pound when present', () => {
    expect(goldPoundPriceEgp(54_520, 6815)).toBe(54_520);
  });

  it('derives from 21k gram when channel omits gold_pound', () => {
    expect(goldPoundPriceEgp(null, 6815)).toBe(6815 * EGYPT_GOLD_POUND_GRAM_WEIGHT);
  });

  it('appends gold pound to metals list from telegram parse', async () => {
    const items = await metalItemsFromEgyptParsed(
      { METALS_GOLD_INSTRUMENT_CODE: 'GOLD_EGP' } as never,
      {
        timestamp: '2026-06-20T12:00:00.000Z',
        karat_18: 5841,
        karat_21: 6815,
        karat_24: 7789,
        spread_21: null,
        silver_local: 132,
        gold_pound: 54_520,
        ounce_egp: null,
        ounce_usd: null,
        dollar_saga: null,
        dollar_parallel: null,
        dollar_official: null,
      },
      new Date('2026-06-20T12:00:00.000Z'),
    );

    const pound = items.find((i) => i.unit === 'gold_pound');
    expect(pound).toMatchObject({
      metal: 'gold',
      karat: 21,
      amountEgp: 54_520,
      quoteCategory: 'indicative',
    });
  });
});
