import { z } from 'zod';

const goldInput = z
  .object({
    mode: z.enum(['egp', 'grams']),
    amount: z.coerce.number().min(0),
    karat: z.coerce.number().int().refine((k) => k === 18 || k === 21 || k === 24).optional(),
    purpose: z.enum(['investment', 'personal_jewelry']).optional(),
  })
  .optional();

const silverInput = z
  .object({
    mode: z.enum(['egp', 'grams']),
    amount: z.coerce.number().min(0),
  })
  .optional();

export const zakatComputeBody = z.object({
  yearType: z.enum(['hijri', 'gregorian']),
  nisabAttainmentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  cashEgp: z.coerce.number().min(0).default(0),
  equitiesEgp: z.coerce.number().min(0).default(0),
  equitiesPurpose: z.enum(['trading', 'long_term_investment']).optional(),
  gold: goldInput,
  silver: silverInput,
  bankCertificatesEgp: z.coerce.number().min(0).default(0),
  realEstateEgp: z.coerce.number().min(0).default(0),
  commercialAssetsEgp: z.coerce.number().min(0).default(0),
  receivablesEgp: z.coerce.number().min(0).default(0),
  debtsOwedEgp: z.coerce.number().min(0).default(0),
});

export const zakatSessionCreateBody = z.object({
  label: z.string().max(120).optional().nullable(),
  inputs: zakatComputeBody,
});

export function zodZakatMessage(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
}

export function mapZakatComputeBodyToInput(
  body: z.infer<typeof zakatComputeBody>,
): import('./zakat.js').ZakatComputeInput {
  return {
    yearType: body.yearType,
    nisabAttainmentDate: body.nisabAttainmentDate,
    cashEgp: body.cashEgp,
    equitiesEgp: body.equitiesEgp,
    equitiesPurpose: body.equitiesPurpose,
    gold: body.gold
      ? {
          mode: body.gold.mode,
          amount: body.gold.amount,
          karat: body.gold.karat as 18 | 21 | 24 | undefined,
          purpose: body.gold.purpose,
        }
      : undefined,
    silver: body.silver,
    bankCertificatesEgp: body.bankCertificatesEgp,
    realEstateEgp: body.realEstateEgp,
    commercialAssetsEgp: body.commercialAssetsEgp,
    receivablesEgp: body.receivablesEgp,
    debtsOwedEgp: body.debtsOwedEgp,
  };
}
