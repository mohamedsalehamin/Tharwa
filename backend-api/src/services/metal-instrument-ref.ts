import { InstrumentKind } from '@prisma/client';
import { z } from 'zod';
import {
  ALL_METAL_QUOTE_INSTRUMENT_CODES,
  metalItemToInstrumentCode,
  type MetalQuoteInstrumentCode,
} from '../lib/metal-instrument-codes.js';
import { prisma } from '../lib/prisma.js';
import { loadMetalInstrumentIdMap } from './metal-quote-snapshots.js';

export const metalJournalRefObject = z.object({
  metal: z.enum(['gold', 'silver']),
  unit: z.enum(['gram', 'troy_ounce']),
  karat: z.union([z.literal(18), z.literal(21), z.literal(24)]).optional().nullable(),
});

export type MetalJournalRef = z.infer<typeof metalJournalRefObject>;

export function isMetalQuoteInstrumentCode(code: string): code is MetalQuoteInstrumentCode {
  return ALL_METAL_QUOTE_INSTRUMENT_CODES.includes(code as MetalQuoteInstrumentCode);
}

export async function resolveMetalInstrumentId(ref: MetalJournalRef): Promise<string | null> {
  const code = metalItemToInstrumentCode({
    metal: ref.metal,
    unit: ref.unit,
    karat: ref.karat ?? null,
  });
  if (!code) return null;
  const idMap = await loadMetalInstrumentIdMap();
  return idMap.get(code) ?? null;
}

export async function resolveJournalInstrumentId(ref: {
  instrumentId?: string;
  symbol?: string;
  displayNameEn?: string;
  displayNameAr?: string;
  metal?: 'gold' | 'silver';
  unit?: 'gram' | 'troy_ounce';
  karat?: 18 | 21 | 24 | null;
}): Promise<string | null> {
  if (ref.instrumentId) {
    const inst = await prisma.instrument.findUnique({ where: { id: ref.instrumentId } });
    if (!inst) return null;
    if (inst.kind === InstrumentKind.equity || inst.kind === InstrumentKind.metal) {
      return inst.id;
    }
    return null;
  }
  if (ref.metal && ref.unit) {
    return resolveMetalInstrumentId({
      metal: ref.metal,
      unit: ref.unit,
      karat: ref.karat ?? null,
    });
  }
  if (ref.symbol) {
    const { ensureEquityInstrument } = await import('./instruments.js');
    return ensureEquityInstrument({
      code: ref.symbol,
      displayNameEn: ref.displayNameEn ?? ref.symbol,
      displayNameAr: ref.displayNameAr,
    });
  }
  return null;
}
