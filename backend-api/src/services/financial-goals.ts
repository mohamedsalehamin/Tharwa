import { z } from 'zod';
import type { FinancialGoal } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { DISCLAIMER_COMBINED } from '../i18n/disclaimers.js';

export const GOALS_DISCLAIMER = `${DISCLAIMER_COMBINED} Required-saving figures assume no investment return and are planning estimates only — not guarantees.`;
const ILLUSTRATIVE_LABEL = 'سيناريو توضيحي — ليس ضماناً | Illustrative scenario — not a guarantee';

const SAVED_CATEGORIES = ['cash', 'certificate', 'real_estate', 'other_asset', 'loan', 'other_liability'] as const;

export const goalBody = z
  .object({
    label: z.string().trim().min(1).max(120),
    targetAmountEgp: z.coerce.number().positive().finite(),
    targetDate: z.coerce.date(),
    savedSource: z.enum(['manual', 'net_worth', 'category']).default('manual'),
    manualSavedEgp: z.coerce.number().min(0).finite().optional().nullable(),
    savedCategory: z.enum(SAVED_CATEGORIES).optional().nullable(),
    illustrativeAnnualRatePct: z.coerce.number().min(-100).max(1000).optional().nullable(),
  })
  .superRefine((b, ctx) => {
    if (b.savedSource === 'category' && !b.savedCategory) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'savedCategory is required when savedSource is "category"',
        path: ['savedCategory'],
      });
    }
  });

export type GoalInput = z.infer<typeof goalBody>;

export function zodGoalMessage(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
}

export type IllustrativeScenario = {
  annualRatePct: number;
  projectedValueEgp: number;
  label: string;
};

export type GoalProjection = {
  status: 'active' | 'achieved' | 'past_due';
  currentSavedEgp: number;
  progressPct: number;
  monthsRemaining: number;
  requiredMonthlyEgp: number;
  onTrack: boolean;
  illustrativeScenario?: IllustrativeScenario;
};

/** Whole calendar months from `from` to `to` (can be negative). */
export function wholeMonthsBetween(from: Date, to: Date): number {
  let months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  if (to.getUTCDate() < from.getUTCDate()) months -= 1;
  return months;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Pure goal math (no assumed return for the required-saving figure). `onTrack` is pace-based:
 * a goal is on track when progress ≥ the fraction of time elapsed (see data-model.md).
 */
export function computeGoalProjection(
  input: {
    targetAmountEgp: number;
    targetDate: Date;
    createdAt: Date;
    currentSavedEgp: number;
    illustrativeAnnualRatePct?: number | null;
  },
  now: Date = new Date(),
): GoalProjection {
  const target = input.targetAmountEgp;
  const saved = Math.max(0, input.currentSavedEgp);

  const monthsRemaining = Math.max(0, wholeMonthsBetween(now, input.targetDate));
  const totalMonths = Math.max(0, wholeMonthsBetween(input.createdAt, input.targetDate));
  const elapsedMonths = Math.max(0, wholeMonthsBetween(input.createdAt, now));

  const achieved = saved >= target;
  const pastDue = !achieved && input.targetDate.getTime() < now.getTime();
  const status: GoalProjection['status'] = achieved ? 'achieved' : pastDue ? 'past_due' : 'active';

  const progressPct = target > 0 ? Math.min(100, (saved / target) * 100) : 0;

  const remaining = Math.max(0, target - saved);
  const requiredMonthlyEgp = achieved ? 0 : remaining / Math.max(1, monthsRemaining);

  const expectedProgressPct = totalMonths === 0 ? 100 : Math.min(100, (elapsedMonths / totalMonths) * 100);
  const onTrack = achieved ? true : pastDue ? false : progressPct >= expectedProgressPct;

  const projection: GoalProjection = {
    status,
    currentSavedEgp: round2(saved),
    progressPct: round2(progressPct),
    monthsRemaining,
    requiredMonthlyEgp: round2(requiredMonthlyEgp),
    onTrack,
  };

  if (input.illustrativeAnnualRatePct != null && Number.isFinite(input.illustrativeAnnualRatePct)) {
    const years = monthsRemaining / 12;
    const projectedValueEgp = saved * Math.pow(1 + input.illustrativeAnnualRatePct / 100, years);
    projection.illustrativeScenario = {
      annualRatePct: input.illustrativeAnnualRatePct,
      projectedValueEgp: round2(projectedValueEgp),
      label: ILLUSTRATIVE_LABEL,
    };
  }

  return projection;
}

export type GoalDto = {
  id: string;
  label: string;
  targetAmountEgp: number;
  targetDate: string;
  savedSource: 'manual' | 'net_worth' | 'category';
  manualSavedEgp: number | null;
  savedCategory: string | null;
  illustrativeAnnualRatePct: number | null;
  status: GoalProjection['status'];
  currentSavedEgp: number;
  progressPct: number;
  monthsRemaining: number;
  requiredMonthlyEgp: number;
  onTrack: boolean;
  illustrativeScenario?: IllustrativeScenario;
  createdAt: string;
  updatedAt: string;
};

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function presentGoal(row: FinancialGoal, currentSavedEgp: number, now: Date = new Date()): GoalDto {
  const projection = computeGoalProjection(
    {
      targetAmountEgp: Number(row.targetAmountEgp),
      targetDate: row.targetDate,
      createdAt: row.createdAt,
      currentSavedEgp,
      illustrativeAnnualRatePct: row.illustrativeAnnualRatePct != null ? Number(row.illustrativeAnnualRatePct) : null,
    },
    now,
  );
  return {
    id: row.id,
    label: row.label,
    targetAmountEgp: Number(row.targetAmountEgp),
    targetDate: toDateStr(row.targetDate),
    savedSource: row.savedSource,
    manualSavedEgp: row.manualSavedEgp != null ? Number(row.manualSavedEgp) : null,
    savedCategory: row.savedCategory ?? null,
    illustrativeAnnualRatePct: row.illustrativeAnnualRatePct != null ? Number(row.illustrativeAnnualRatePct) : null,
    ...projection,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function listGoals(consumerUserId: string): Promise<FinancialGoal[]> {
  return prisma.financialGoal.findMany({
    where: { consumerUserId },
    orderBy: { createdAt: 'asc' },
  });
}

export function createGoal(consumerUserId: string, input: GoalInput): Promise<FinancialGoal> {
  return prisma.financialGoal.create({
    data: {
      consumerUserId,
      label: input.label,
      targetAmountEgp: input.targetAmountEgp,
      targetDate: input.targetDate,
      savedSource: input.savedSource,
      manualSavedEgp: input.manualSavedEgp ?? null,
      savedCategory: input.savedCategory ?? null,
      illustrativeAnnualRatePct: input.illustrativeAnnualRatePct ?? null,
    },
  });
}

export async function updateGoal(
  consumerUserId: string,
  id: string,
  input: GoalInput,
): Promise<FinancialGoal> {
  const existing = await prisma.financialGoal.findFirst({
    where: { id, consumerUserId },
    select: { id: true },
  });
  if (!existing) throw new AppError('NOT_FOUND', 'Goal not found', 404);
  return prisma.financialGoal.update({
    where: { id },
    data: {
      label: input.label,
      targetAmountEgp: input.targetAmountEgp,
      targetDate: input.targetDate,
      savedSource: input.savedSource,
      manualSavedEgp: input.manualSavedEgp ?? null,
      savedCategory: input.savedCategory ?? null,
      illustrativeAnnualRatePct: input.illustrativeAnnualRatePct ?? null,
    },
  });
}

export async function deleteGoal(consumerUserId: string, id: string): Promise<void> {
  const deleted = await prisma.financialGoal.deleteMany({ where: { id, consumerUserId } });
  if (deleted.count === 0) throw new AppError('NOT_FOUND', 'Goal not found', 404);
}
