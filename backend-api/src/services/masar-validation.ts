import { z } from 'zod';
import type { MasarArchetype } from '@prisma/client';
import { validateAllocation } from './masar-model.js';

export const quizAnswersBody = z.object({
  goal: z.enum(['grow_long_term', 'protect_income_short_term', 'not_sure']),
  volatilityComfort: z.enum(['comfortable', 'somewhat', 'uncomfortable']),
  nearTermNeed: z.enum(['yes', 'no', 'not_sure']),
  shariaPreferred: z.boolean(),
});

export type QuizAnswers = z.infer<typeof quizAnswersBody>;

export const allocationBody = z
  .object({
    equityPct: z.number().int().min(0).max(100),
    fixedIncomePct: z.number().int().min(0).max(100),
    goldPct: z.number().int().min(0).max(100),
  })
  .superRefine((a, ctx) => {
    const err = validateAllocation(a);
    if (err) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: err, path: ['equityPct'] });
    }
  });

export type AllocationInput = z.infer<typeof allocationBody>;

const MASAR_ARCHETYPE_VALUES = [
  'conservative',
  'cautious_balanced',
  'balanced',
  'growth_balanced',
  'aggressive_long_term',
] as const satisfies readonly MasarArchetype[];

export const masarProfileBody = z.object({
  archetype: z.enum(MASAR_ARCHETYPE_VALUES),
  allocation: allocationBody,
  shariaPreferred: z.boolean().optional().default(false),
  answers: quizAnswersBody.optional(),
});

export type MasarProfileInput = z.infer<typeof masarProfileBody>;

export const illustrationBody = z.object({
  allocation: allocationBody,
  months: z.number().int().min(1).max(120).optional().default(60),
});

export function zodMasarMessage(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
}
