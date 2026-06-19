import type { MetalItem } from '../services/connectors/metals.js';

/** Stable instrument codes for persisted metal quote rows. */
export const METAL_QUOTE_INSTRUMENT_CODES = {
  GOLD_24K_GRAM: 'GOLD_24K_GRAM_EGP',
  GOLD_21K_GRAM: 'GOLD_21K_GRAM_EGP',
  GOLD_18K_GRAM: 'GOLD_18K_GRAM_EGP',
  GOLD_POUND: 'GOLD_POUND_EGP',
  GOLD_TROY_OZ: 'GOLD_TROY_OZ_EGP',
  SILVER_GRAM: 'SILVER_EGP',
} as const;

export type MetalQuoteInstrumentCode =
  (typeof METAL_QUOTE_INSTRUMENT_CODES)[keyof typeof METAL_QUOTE_INSTRUMENT_CODES];

export const ALL_METAL_QUOTE_INSTRUMENT_CODES: MetalQuoteInstrumentCode[] = [
  METAL_QUOTE_INSTRUMENT_CODES.GOLD_24K_GRAM,
  METAL_QUOTE_INSTRUMENT_CODES.GOLD_21K_GRAM,
  METAL_QUOTE_INSTRUMENT_CODES.GOLD_18K_GRAM,
  METAL_QUOTE_INSTRUMENT_CODES.GOLD_POUND,
  METAL_QUOTE_INSTRUMENT_CODES.GOLD_TROY_OZ,
  METAL_QUOTE_INSTRUMENT_CODES.SILVER_GRAM,
];

const DISPLAY_ORDER: MetalQuoteInstrumentCode[] = [
  METAL_QUOTE_INSTRUMENT_CODES.GOLD_24K_GRAM,
  METAL_QUOTE_INSTRUMENT_CODES.GOLD_21K_GRAM,
  METAL_QUOTE_INSTRUMENT_CODES.GOLD_POUND,
  METAL_QUOTE_INSTRUMENT_CODES.GOLD_18K_GRAM,
  METAL_QUOTE_INSTRUMENT_CODES.GOLD_TROY_OZ,
  METAL_QUOTE_INSTRUMENT_CODES.SILVER_GRAM,
];

export function metalItemToInstrumentCode(
  item: Pick<MetalItem, 'metal' | 'unit' | 'karat'>,
): MetalQuoteInstrumentCode | null {
  if (item.metal === 'silver' && item.unit === 'gram') {
    return METAL_QUOTE_INSTRUMENT_CODES.SILVER_GRAM;
  }
  if (item.metal !== 'gold') return null;
  if (item.unit === 'gold_pound') return METAL_QUOTE_INSTRUMENT_CODES.GOLD_POUND;
  if (item.unit === 'troy_ounce') return METAL_QUOTE_INSTRUMENT_CODES.GOLD_TROY_OZ;
  if (item.unit === 'gram' && item.karat === 24) return METAL_QUOTE_INSTRUMENT_CODES.GOLD_24K_GRAM;
  if (item.unit === 'gram' && item.karat === 21) return METAL_QUOTE_INSTRUMENT_CODES.GOLD_21K_GRAM;
  if (item.unit === 'gram' && item.karat === 18) return METAL_QUOTE_INSTRUMENT_CODES.GOLD_18K_GRAM;
  return null;
}

export function instrumentCodeSortIndex(code: string): number {
  const idx = DISPLAY_ORDER.indexOf(code as MetalQuoteInstrumentCode);
  return idx >= 0 ? idx : 999;
}
