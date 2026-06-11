import { z } from 'zod';
import type { InflationBenchmark } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

export const inflationBenchmarkBody = z
  .object({
    periodMonth: z.coerce.date(),
    indexValue: z.coerce.number().positive().finite().optional().nullable(),
    yoyRatePct: z.coerce.number().min(-100).max(10000).finite().optional().nullable(),
    sourceLabel: z.string().trim().min(1).max(200),
    asOf: z.coerce.date().optional().nullable(),
  })
  .superRefine((b, ctx) => {
    if (b.indexValue == null && b.yoyRatePct == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide at least one of indexValue or yoyRatePct',
        path: ['indexValue'],
      });
    }
  });

export type InflationBenchmarkInput = z.infer<typeof inflationBenchmarkBody>;

export function zodInflationMessage(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
}

export type InflationBenchmarkDto = {
  id: string;
  periodMonth: string;
  indexValue: number | null;
  yoyRatePct: number | null;
  sourceLabel: string;
  asOf: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Normalise to the first day of the period's month (UTC). */
function normalizeMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export function presentInflationBenchmark(row: InflationBenchmark): InflationBenchmarkDto {
  return {
    id: row.id,
    periodMonth: row.periodMonth.toISOString().slice(0, 10),
    indexValue: row.indexValue != null ? Number(row.indexValue) : null,
    yoyRatePct: row.yoyRatePct != null ? Number(row.yoyRatePct) : null,
    sourceLabel: row.sourceLabel,
    asOf: row.asOf ? row.asOf.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function listInflationBenchmarks(): Promise<InflationBenchmark[]> {
  return prisma.inflationBenchmark.findMany({ orderBy: { periodMonth: 'desc' } });
}

export function upsertInflationBenchmark(input: InflationBenchmarkInput): Promise<InflationBenchmark> {
  const periodMonth = normalizeMonth(input.periodMonth);
  return prisma.inflationBenchmark.upsert({
    where: { periodMonth },
    update: {
      indexValue: input.indexValue ?? null,
      yoyRatePct: input.yoyRatePct ?? null,
      sourceLabel: input.sourceLabel,
      asOf: input.asOf ?? null,
    },
    create: {
      periodMonth,
      indexValue: input.indexValue ?? null,
      yoyRatePct: input.yoyRatePct ?? null,
      sourceLabel: input.sourceLabel,
      asOf: input.asOf ?? null,
    },
  });
}

/** Index value nearest to (on or before) the given month; falls back to the closest after. */
export async function inflationIndexForMonth(periodMonth: Date): Promise<number | null> {
  const month = normalizeMonth(periodMonth);
  const onOrBefore = await prisma.inflationBenchmark.findFirst({
    where: { periodMonth: { lte: month }, indexValue: { not: null } },
    orderBy: { periodMonth: 'desc' },
    select: { indexValue: true },
  });
  if (onOrBefore?.indexValue != null) return Number(onOrBefore.indexValue);
  const after = await prisma.inflationBenchmark.findFirst({
    where: { periodMonth: { gt: month }, indexValue: { not: null } },
    orderBy: { periodMonth: 'asc' },
    select: { indexValue: true },
  });
  return after?.indexValue != null ? Number(after.indexValue) : null;
}
