import { InstrumentKind, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { resolveTradingViewSymbol } from './connectors/equities.js';
import {
  isPlausibleEgxTickerForTv,
  normalizeEquitySymbolParam,
} from './curated-equities.js';

export type CreateEquityInstrumentInput = {
  code: string;
  displayNameEn: string;
  displayNameAr?: string;
  isConsumerVisible?: boolean;
  sortOrder?: number;
  metadata?: { tvSymbol?: string } | null;
};

function equityMetadata(
  code: string,
  metadata?: { tvSymbol?: string } | null,
): Prisma.InputJsonObject {
  const tvSymbol = resolveTradingViewSymbol(code, metadata ?? null);
  return { tvSymbol } satisfies Prisma.InputJsonObject;
}

export function validateEquityInstrumentCode(raw: string): string {
  const code = normalizeEquitySymbolParam(raw);
  if (!isPlausibleEgxTickerForTv(code)) {
    throw new Error('Invalid EGX ticker code');
  }
  return code;
}

export async function nextEquitySortOrder(): Promise<number> {
  const agg = await prisma.instrument.aggregate({
    where: { kind: InstrumentKind.equity },
    _max: { sortOrder: true },
  });
  return (agg._max.sortOrder ?? 0) + 10;
}

/** Admin POST /admin/v1/instruments — curated EGX equity row. */
export async function createEquityInstrument(input: CreateEquityInstrumentInput) {
  const code = validateEquityInstrumentCode(input.code);

  const nameEn = input.displayNameEn.trim() || code;
  const nameAr = input.displayNameAr?.trim() || nameEn;
  const sortOrder = input.sortOrder ?? (await nextEquitySortOrder());

  return prisma.instrument.create({
    data: {
      kind: InstrumentKind.equity,
      code,
      displayNameEn: nameEn,
      displayNameAr: nameAr,
      isConsumerVisible: input.isConsumerVisible ?? false,
      sortOrder,
      metadata: equityMetadata(code, input.metadata),
    },
  });
}

/** Find or create a DB instrument row for an EGX equity code (journal / alerts). */
export async function ensureEquityInstrument(params: {
  code: string;
  displayNameEn: string;
  displayNameAr?: string;
}): Promise<string> {
  const code = validateEquityInstrumentCode(params.code);
  const existing = await prisma.instrument.findUnique({ where: { code } });
  if (existing) return existing.id;

  const row = await createEquityInstrument({
    code,
    displayNameEn: params.displayNameEn,
    displayNameAr: params.displayNameAr,
    isConsumerVisible: false,
  });
  return row.id;
}

export function instrumentAdminPayload(r: {
  id: string;
  kind: string;
  code: string;
  displayNameAr: string;
  displayNameEn: string;
  isConsumerVisible: boolean;
  sortOrder: number;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: r.id,
    kind: r.kind,
    code: r.code,
    displayNameAr: r.displayNameAr,
    displayNameEn: r.displayNameEn,
    isConsumerVisible: r.isConsumerVisible,
    sortOrder: r.sortOrder,
    metadata: r.metadata,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}
