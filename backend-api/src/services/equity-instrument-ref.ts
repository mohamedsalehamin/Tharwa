import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ensureEquityInstrument } from './instruments.js';

export const optionalUuid = z.preprocess(
  (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
  z.string().uuid().optional(),
);

const equityInstrumentRefObject = z.object({
  instrumentId: optionalUuid,
  symbol: z.string().trim().min(1).max(32).optional(),
  displayNameEn: z.string().trim().max(500).optional(),
  displayNameAr: z.string().trim().max(500).optional(),
});

const requireInstrumentIdOrSymbol = <T extends { instrumentId?: string; symbol?: string }>(
  b: T,
  ctx: z.RefinementCtx,
) => {
  if (!b.instrumentId && !b.symbol) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'instrumentId or symbol is required',
      path: ['instrumentId'],
    });
  }
};

/** Body fields shared by journal create and watchlist add for EGX equities. */
export const equityInstrumentRefBody = equityInstrumentRefObject.superRefine(requireInstrumentIdOrSymbol);

export { equityInstrumentRefObject };

export type EquityInstrumentRef = z.infer<typeof equityInstrumentRefBody>;

export async function resolveEquityInstrumentId(ref: EquityInstrumentRef): Promise<string | null> {
  if (ref.instrumentId) {
    const inst = await prisma.instrument.findUnique({ where: { id: ref.instrumentId } });
    return inst?.id ?? null;
  }
  if (ref.symbol) {
    return ensureEquityInstrument({
      code: ref.symbol,
      displayNameEn: ref.displayNameEn ?? ref.symbol,
      displayNameAr: ref.displayNameAr,
    });
  }
  return null;
}
