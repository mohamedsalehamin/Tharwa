import { InstrumentKind } from '@prisma/client';
import type { Redis } from 'ioredis';
import type { Env } from '../config/env.js';
import { invalidateMarketCaches as invalidateCachesByScope } from './market-cache.js';
import {
  parseFlagUrl,
  parseFxMetadata,
  type QuoteCategoryLabel,
} from '../lib/instrument-metadata.js';
import {
  ALL_METAL_QUOTE_INSTRUMENT_CODES,
  metalItemToInstrumentCode,
} from '../lib/metal-instrument-codes.js';
import { prisma } from '../lib/prisma.js';
import type { FxRateItem } from './connectors/fx.js';
import type { MetalItem } from './connectors/metals.js';

export type FxPresentationRow = {
  code: string;
  sortOrder: number;
  displayNameEn: string;
  displayNameAr: string;
  quoteCategory: QuoteCategoryLabel;
  flagUrl?: string;
};

export async function loadFxPresentationConfig(): Promise<{
  visibleCodes: Set<string>;
  orderByCode: Map<string, number>;
  presentationByCode: Map<string, FxPresentationRow>;
}> {
  const rows = await prisma.instrument.findMany({
    where: { kind: InstrumentKind.fx, isConsumerVisible: true },
    select: {
      code: true,
      sortOrder: true,
      displayNameEn: true,
      displayNameAr: true,
      metadata: true,
    },
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
  });
  const visibleCodes = new Set(rows.map((r) => r.code.toUpperCase()));
  const orderByCode = new Map(rows.map((r) => [r.code.toUpperCase(), r.sortOrder]));
  const presentationByCode = new Map(
    rows.map((r) => {
      const code = r.code.toUpperCase();
      const { quoteCategory, flagUrl } = parseFxMetadata(r.metadata);
      return [
        code,
        {
          code,
          sortOrder: r.sortOrder,
          displayNameEn: r.displayNameEn,
          displayNameAr: r.displayNameAr,
          quoteCategory: quoteCategory ?? 'official',
          flagUrl,
        },
      ] as const;
    }),
  );
  return { visibleCodes, orderByCode, presentationByCode };
}

/** Filter and label FX rates per admin instrument visibility (FR-009). */
export async function applyFxPresentation(items: FxRateItem[]): Promise<FxRateItem[]> {
  const { visibleCodes, orderByCode, presentationByCode } = await loadFxPresentationConfig();
  if (visibleCodes.size === 0) return [];

  const filtered = items
    .filter((i) => visibleCodes.has(i.baseCurrency.toUpperCase()))
    .map((i) => {
      const code = i.baseCurrency.toUpperCase();
      const pres = presentationByCode.get(code);
      return {
        ...i,
        quoteCategory: pres?.quoteCategory ?? 'official',
        displayNameEn: pres?.displayNameEn ?? i.baseCurrency,
        displayNameAr: pres?.displayNameAr ?? pres?.displayNameEn ?? i.baseCurrency,
        flagUrl: pres?.flagUrl,
      };
    });

  filtered.sort((a, b) => {
    const ao = orderByCode.get(a.baseCurrency.toUpperCase()) ?? 9999;
    const bo = orderByCode.get(b.baseCurrency.toUpperCase()) ?? 9999;
    if (ao !== bo) return ao - bo;
    return a.baseCurrency.localeCompare(b.baseCurrency);
  });

  return filtered;
}

export async function loadMetalPresentation(env: Env): Promise<{
  goldVisible: boolean;
  silverVisible: boolean;
  goldFlagUrl?: string;
  silverFlagUrl?: string;
}> {
  const [gold, silver] = await Promise.all([
    prisma.instrument.findFirst({
      where: { kind: InstrumentKind.metal, code: env.METALS_GOLD_INSTRUMENT_CODE },
      select: { isConsumerVisible: true, metadata: true },
    }),
    prisma.instrument.findFirst({
      where: { kind: InstrumentKind.metal, code: 'SILVER_EGP' },
      select: { isConsumerVisible: true, metadata: true },
    }),
  ]);
  return {
    goldVisible: gold?.isConsumerVisible ?? false,
    silverVisible: silver?.isConsumerVisible ?? false,
    goldFlagUrl: parseFlagUrl(gold?.metadata),
    silverFlagUrl: parseFlagUrl(silver?.metadata),
  };
}

/** Per-row metal icons from quote instrument metadata (falls back to parent gold/silver in applyMetalsPresentation). */
async function loadMetalQuoteFlagByCode(): Promise<Map<string, string>> {
  const rows = await prisma.instrument.findMany({
    where: { code: { in: [...ALL_METAL_QUOTE_INSTRUMENT_CODES] } },
    select: { code: true, metadata: true },
  });
  const map = new Map<string, string>();
  for (const row of rows) {
    const flagUrl = parseFlagUrl(row.metadata);
    if (flagUrl) map.set(row.code, flagUrl);
  }
  return map;
}

/** Filter metal quote rows per admin instrument visibility (FR-009). */
export async function applyMetalsPresentation(
  env: Env,
  items: MetalItem[],
): Promise<MetalItem[]> {
  const [{ goldVisible, silverVisible, goldFlagUrl, silverFlagUrl }, flagByCode] =
    await Promise.all([loadMetalPresentation(env), loadMetalQuoteFlagByCode()]);
  return items
    .filter((i) => {
      if (i.metal === 'gold') return goldVisible;
      if (i.metal === 'silver') return silverVisible;
      return false;
    })
    .map((i) => {
      const code = metalItemToInstrumentCode(i);
      const specific = code ? flagByCode.get(code) : undefined;
      const fallback =
        i.metal === 'gold' ? goldFlagUrl : i.metal === 'silver' ? silverFlagUrl : undefined;
      return {
        ...i,
        flagUrl: specific ?? fallback,
      };
    });
}

export async function invalidateMarketCachesForInstrument(
  redis: Redis,
  kind: InstrumentKind,
): Promise<void> {
  const scope =
    kind === InstrumentKind.equity
      ? 'equities'
      : kind === InstrumentKind.fx
        ? 'fx'
        : 'metals';
  await invalidateCachesByScope(redis, [scope]);
}
