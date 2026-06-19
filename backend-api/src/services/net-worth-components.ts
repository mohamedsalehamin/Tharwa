import { z } from 'zod';
import type { ManualNetWorthComponent } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import type { EgpConverter } from '../lib/egp-convert.js';

export const ASSET_CATEGORIES = ['cash', 'certificate', 'real_estate', 'other_asset'] as const;
export const LIABILITY_CATEGORIES = ['loan', 'other_liability'] as const;
const ALL_CATEGORIES = [...ASSET_CATEGORIES, ...LIABILITY_CATEGORIES] as const;

/** Currencies accepted for manual entries: EGP plus the FX bases the backend serves. */
const SUPPORTED_CURRENCIES = [
  'EGP',
  'USD',
  'EUR',
  'SAR',
  'AED',
  'GBP',
  'KWD',
  'OMR',
  'QAR',
  'BHD',
  'JPY',
  'CHF',
  'CNY',
];

export const manualComponentBody = z
  .object({
    kind: z.enum(['asset', 'liability']),
    category: z.enum(ALL_CATEGORIES),
    label: z.string().trim().max(120).optional().nullable(),
    amount: z.coerce.number().positive().finite(),
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .default('EGP')
      .refine((c) => SUPPORTED_CURRENCIES.includes(c), { message: 'Unsupported currency' }),
    note: z.string().trim().max(2000).optional().nullable(),
  })
  .superRefine((b, ctx) => {
    const isAssetCat = (ASSET_CATEGORIES as readonly string[]).includes(b.category);
    if (b.kind === 'asset' && !isAssetCat) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'asset kind requires an asset category (cash, certificate, real_estate, other_asset)',
        path: ['category'],
      });
    }
    if (b.kind === 'liability' && isAssetCat) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'liability kind requires a liability category (loan, other_liability)',
        path: ['category'],
      });
    }
  });

export type ManualComponentInput = z.infer<typeof manualComponentBody>;

export type ManualComponentDto = {
  id: string;
  kind: 'asset' | 'liability';
  category: string;
  label: string | null;
  amount: number;
  currency: string;
  note: string | null;
  amountEgp: number | null;
  fxAsOf: string | null;
  createdAt: string;
  updatedAt: string;
};

export function zodComponentMessage(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
}

export function presentComponent(
  row: ManualNetWorthComponent,
  convert: EgpConverter,
): ManualComponentDto {
  const amount = Number(row.amount);
  const conv = convert(amount, row.currency);
  return {
    id: row.id,
    kind: row.kind,
    category: row.category,
    label: row.label ?? null,
    amount,
    currency: row.currency,
    note: row.note ?? null,
    amountEgp: conv.amountEgp,
    fxAsOf: conv.asOf,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function listComponents(consumerUserId: string): Promise<ManualNetWorthComponent[]> {
  return prisma.manualNetWorthComponent.findMany({
    where: { consumerUserId },
    orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }],
  });
}

export function createComponent(
  consumerUserId: string,
  input: ManualComponentInput,
): Promise<ManualNetWorthComponent> {
  return prisma.manualNetWorthComponent.create({
    data: {
      consumerUserId,
      kind: input.kind,
      category: input.category,
      label: input.label ?? null,
      amount: input.amount,
      currency: input.currency,
      note: input.note ?? null,
    },
  });
}

export async function updateComponent(
  consumerUserId: string,
  id: string,
  input: ManualComponentInput,
): Promise<ManualNetWorthComponent> {
  const existing = await prisma.manualNetWorthComponent.findFirst({
    where: { id, consumerUserId },
    select: { id: true },
  });
  if (!existing) {
    throw new AppError('NOT_FOUND', 'Component not found', 404);
  }
  return prisma.manualNetWorthComponent.update({
    where: { id },
    data: {
      kind: input.kind,
      category: input.category,
      label: input.label ?? null,
      amount: input.amount,
      currency: input.currency,
      note: input.note ?? null,
    },
  });
}

export async function deleteComponent(consumerUserId: string, id: string): Promise<void> {
  const deleted = await prisma.manualNetWorthComponent.deleteMany({
    where: { id, consumerUserId },
  });
  if (deleted.count === 0) {
    throw new AppError('NOT_FOUND', 'Component not found', 404);
  }
}
