import { MetalUnit, type MetalKaratRule } from '@prisma/client';
import { prisma } from './prisma.js';
import type { MetalItem } from '../services/connectors/metals.js';
import type { QuoteMeta } from '../services/connectors/fx.js';

const OUNCE_GRAMS = 31.1034768;

export type KaratRuleRow = Pick<
  MetalKaratRule,
  'karat' | 'unit' | 'priceNumerator' | 'priceDenominator' | 'sortOrder'
>;

/** Default 18/21/24 gram + troy oz rules (24k anchor). */
export const DEFAULT_GOLD_KARAT_RULES: KaratRuleRow[] = [
  { karat: 24, unit: MetalUnit.gram, priceNumerator: 24, priceDenominator: 24, sortOrder: 0 },
  { karat: 21, unit: MetalUnit.gram, priceNumerator: 21, priceDenominator: 24, sortOrder: 1 },
  { karat: 18, unit: MetalUnit.gram, priceNumerator: 18, priceDenominator: 24, sortOrder: 2 },
  { karat: null, unit: MetalUnit.troy_ounce, priceNumerator: 1, priceDenominator: 1, sortOrder: 3 },
];

export async function loadActiveKaratRulesForInstrument(instrumentId: string): Promise<KaratRuleRow[]> {
  const rows = await prisma.metalKaratRule.findMany({
    where: { instrumentId, isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { karat: 'asc' }],
    select: {
      karat: true,
      unit: true,
      priceNumerator: true,
      priceDenominator: true,
      sortOrder: true,
    },
  });
  return rows.length > 0 ? rows : DEFAULT_GOLD_KARAT_RULES;
}

export async function loadActiveKaratRulesByGoldCode(code: string): Promise<KaratRuleRow[]> {
  const ins = await prisma.instrument.findFirst({
    where: { kind: 'metal', code },
    select: { id: true },
  });
  if (!ins) return DEFAULT_GOLD_KARAT_RULES;
  return loadActiveKaratRulesForInstrument(ins.id);
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function buildGoldRowsFromKaratRules(
  anchor24kGramEgp: number,
  rules: KaratRuleRow[],
  asOf: Date,
  isStale: boolean,
): MetalItem[] {
  const baseMeta = (): QuoteMeta => ({
    asOf: asOf.toISOString(),
    quoteCategory: 'indicative',
    sessionState: 'unknown',
    isStale,
  });

  return rules.map((rule) => {
    const ratio =
      rule.priceDenominator > 0 ? rule.priceNumerator / rule.priceDenominator : 1;
    let amount = anchor24kGramEgp * ratio;
    if (rule.unit === MetalUnit.troy_ounce) {
      amount = anchor24kGramEgp * OUNCE_GRAMS * ratio;
    }
    const karat =
      rule.karat === 18 || rule.karat === 21 || rule.karat === 24
        ? (rule.karat as 18 | 21 | 24)
        : null;
    return {
      ...baseMeta(),
      metal: 'gold' as const,
      unit: rule.unit === MetalUnit.troy_ounce ? 'troy_ounce' : 'gram',
      karat,
      amountEgp: round4(amount),
    };
  });
}
