import { z } from 'zod';
import type { MasarBenchmarkPoint } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

export const masarBenchmarkBody = z
  .object({
    periodMonth: z.coerce.date(),
    equityIndex: z.coerce.number().positive().finite().optional().nullable(),
    fixedIncomeIndex: z.coerce.number().positive().finite().optional().nullable(),
    goldEgpPerGram: z.coerce.number().positive().finite().optional().nullable(),
    usdEgp: z.coerce.number().positive().finite().optional().nullable(),
    sourceLabel: z.string().trim().min(1).max(200),
    asOf: z.coerce.date().optional().nullable(),
  })
  .superRefine((b, ctx) => {
    if (
      b.equityIndex == null &&
      b.fixedIncomeIndex == null &&
      b.goldEgpPerGram == null &&
      b.usdEgp == null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide at least one index value',
        path: ['equityIndex'],
      });
    }
  });

export type MasarBenchmarkInput = z.infer<typeof masarBenchmarkBody>;

export function zodMasarBenchmarkMessage(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
}

export type MasarBenchmarkDto = {
  id: string;
  periodMonth: string;
  equityIndex: number | null;
  fixedIncomeIndex: number | null;
  goldEgpPerGram: number | null;
  usdEgp: number | null;
  sourceLabel: string;
  asOf: string | null;
  createdAt: string;
  updatedAt: string;
};

function normalizeMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export function presentMasarBenchmark(row: MasarBenchmarkPoint): MasarBenchmarkDto {
  return {
    id: row.id,
    periodMonth: row.periodMonth.toISOString().slice(0, 10),
    equityIndex: row.equityIndex != null ? Number(row.equityIndex) : null,
    fixedIncomeIndex: row.fixedIncomeIndex != null ? Number(row.fixedIncomeIndex) : null,
    goldEgpPerGram: row.goldEgpPerGram != null ? Number(row.goldEgpPerGram) : null,
    usdEgp: row.usdEgp != null ? Number(row.usdEgp) : null,
    sourceLabel: row.sourceLabel,
    asOf: row.asOf ? row.asOf.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function listMasarBenchmarks(): Promise<MasarBenchmarkPoint[]> {
  return prisma.masarBenchmarkPoint.findMany({ orderBy: { periodMonth: 'desc' } });
}

export function upsertMasarBenchmark(input: MasarBenchmarkInput): Promise<MasarBenchmarkPoint> {
  const periodMonth = normalizeMonth(input.periodMonth);
  return prisma.masarBenchmarkPoint.upsert({
    where: { periodMonth },
    update: {
      equityIndex: input.equityIndex ?? null,
      fixedIncomeIndex: input.fixedIncomeIndex ?? null,
      goldEgpPerGram: input.goldEgpPerGram ?? null,
      usdEgp: input.usdEgp ?? null,
      sourceLabel: input.sourceLabel,
      asOf: input.asOf ?? null,
    },
    create: {
      periodMonth,
      equityIndex: input.equityIndex ?? null,
      fixedIncomeIndex: input.fixedIncomeIndex ?? null,
      goldEgpPerGram: input.goldEgpPerGram ?? null,
      usdEgp: input.usdEgp ?? null,
      sourceLabel: input.sourceLabel,
      asOf: input.asOf ?? null,
    },
  });
}

export async function masarBenchmarkForMonth(periodMonth: Date): Promise<MasarBenchmarkPoint | null> {
  const month = normalizeMonth(periodMonth);
  const onOrBefore = await prisma.masarBenchmarkPoint.findFirst({
    where: { periodMonth: { lte: month } },
    orderBy: { periodMonth: 'desc' },
  });
  if (onOrBefore) return onOrBefore;
  return prisma.masarBenchmarkPoint.findFirst({
    where: { periodMonth: { gt: month } },
    orderBy: { periodMonth: 'asc' },
  });
}
