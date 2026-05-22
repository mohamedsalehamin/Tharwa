import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { equityInstrumentRefObject } from './equity-instrument-ref.js';

export const journalCreateBody = equityInstrumentRefObject
  .extend({
    side: z.enum(['buy', 'sell']),
    quantity: z.coerce.number().positive(),
    price: z.coerce.number().min(0),
    executedAt: z.coerce.date(),
    note: z.string().max(2000).optional().nullable(),
  })
  .superRefine((b, ctx) => {
    if (!b.instrumentId && !b.symbol) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'instrumentId or symbol is required',
        path: ['instrumentId'],
      });
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
