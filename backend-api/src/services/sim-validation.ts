import { z } from 'zod';
import { equityInstrumentRefObject } from './equity-instrument-ref.js';

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

export const simTradeCreateBody = equityInstrumentRefObject
  .extend({
    side: z.enum(['buy', 'sell']),
    quantity: z.coerce.number().positive(),
  })
  .superRefine(requireInstrumentIdOrSymbol);

export function zodSimMessage(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
}
