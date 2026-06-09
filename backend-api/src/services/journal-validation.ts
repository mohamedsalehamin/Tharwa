import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { equityInstrumentRefObject } from './equity-instrument-ref.js';
import { metalJournalRefObject } from './metal-instrument-ref.js';

export const journalCreateBody = equityInstrumentRefObject
  .merge(metalJournalRefObject.partial())
  .extend({
    side: z.enum(['buy', 'sell']),
    quantity: z.coerce.number().positive(),
    price: z.coerce.number().min(0),
    executedAt: z.coerce.date(),
    note: z.string().max(2000).optional().nullable(),
  })
  .superRefine((b, ctx) => {
    const hasEquityRef = Boolean(b.instrumentId || b.symbol);
    const hasMetalRef = Boolean(b.metal && b.unit);

    if (!hasEquityRef && !hasMetalRef) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'instrumentId, symbol, or metal+unit is required',
        path: ['instrumentId'],
      });
      return;
    }

    if (hasEquityRef && hasMetalRef) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide either equity fields or metal fields, not both',
        path: ['metal'],
      });
      return;
    }

    if (hasMetalRef) {
      if (b.metal === 'gold' && b.unit === 'gram' && b.karat == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Gold gram entries require karat (18, 21, or 24)',
          path: ['karat'],
        });
      }
      if (b.metal === 'silver' && b.unit !== 'gram') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Silver is tracked per gram only',
          path: ['unit'],
        });
      }
    }
  });

export const journalPatchBody = z
  .object({
    note: z.string().max(2000).optional().nullable(),
    price: z.coerce.number().min(0).optional(),
    executedAt: z.coerce.date().optional(),
  })
  .refine((b) => b.note !== undefined || b.price !== undefined || b.executedAt !== undefined, {
    message: 'At least one field required',
  });

export function zodJournalMessage(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
}

export async function assertJournalSellAllowed(
  userId: string,
  instrumentId: string,
  sellQuantity: number,
): Promise<void> {
  const entries = await prisma.tradeJournalEntry.findMany({
    where: { consumerUserId: userId, instrumentId },
    orderBy: [{ executedAt: 'asc' }, { createdAt: 'asc' }],
    select: { side: true, quantity: true },
  });
  let net = 0;
  for (const e of entries) {
    const q = Number(e.quantity);
    net += e.side === 'buy' ? q : -q;
  }
  if (sellQuantity > net + 1e-9) {
    throw new AppError('VALIDATION', 'Sell quantity exceeds recorded position for this instrument', 400);
  }
}
