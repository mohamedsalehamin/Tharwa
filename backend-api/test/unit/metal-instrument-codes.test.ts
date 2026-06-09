import { describe, expect, it } from 'vitest';
import {
  METAL_QUOTE_INSTRUMENT_CODES,
  metalItemToInstrumentCode,
} from '../../src/lib/metal-instrument-codes.js';

describe('metal instrument codes', () => {
  it('maps each MetalItem shape to a stable instrument code', () => {
    expect(
      metalItemToInstrumentCode({ metal: 'gold', unit: 'gram', karat: 21 }),
    ).toBe(METAL_QUOTE_INSTRUMENT_CODES.GOLD_21K_GRAM);
    expect(
      metalItemToInstrumentCode({ metal: 'gold', unit: 'troy_ounce', karat: null }),
    ).toBe(METAL_QUOTE_INSTRUMENT_CODES.GOLD_TROY_OZ);
    expect(
      metalItemToInstrumentCode({ metal: 'silver', unit: 'gram', karat: null }),
    ).toBe(METAL_QUOTE_INSTRUMENT_CODES.SILVER_GRAM);
  });
});
