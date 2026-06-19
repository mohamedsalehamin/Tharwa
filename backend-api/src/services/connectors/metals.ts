import type { FastifyBaseLogger } from 'fastify';
import type { Env } from '../../config/env.js';
import { observeConnector } from '../../lib/connector-metrics.js';
import {
  buildGoldRowsFromKaratRules,
  loadActiveKaratRulesByGoldCode,
} from '../../lib/metal-karat-rules.js';
import type { QuoteMeta } from './fx.js';
import type { EgyptParsedPrices } from './telegram-egypt-metals.js';
import type { EgyptTelegramBundle } from '../egypt-telegram-bundle.js';

export type MetalItem = QuoteMeta & {
  metal: 'gold' | 'silver';
  unit: 'gram' | 'troy_ounce' | 'gold_pound';
  karat: 18 | 21 | 24 | null;
  amountEgp: number;
  /** Admin-uploaded icon (same for all rows of that metal). */
  flagUrl?: string;
};

/** Egyptian retail gold pound = 8 grams of 21-karat gold. */
export const EGYPT_GOLD_POUND_GRAM_WEIGHT = 8;

/** Built-in fallback when Telegram/mock are unavailable (used to detect “still failing” + short Redis TTL). */
export const METALS_PLACEHOLDER_GOLD_24_PER_GRAM = 3200;

async function buildGoldRowsForEnv(
  env: Env,
  price24PerGram: number,
  asOf: Date,
  isStale: boolean,
): Promise<MetalItem[]> {
  const rules = await loadActiveKaratRulesByGoldCode(env.METALS_GOLD_INSTRUMENT_CODE);
  return buildGoldRowsFromKaratRules(price24PerGram, rules, asOf, isStale);
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** Channel price when present; otherwise 8 × 21k gram (standard Egyptian gold pound). */
export function goldPoundPriceEgp(
  direct: number | null | undefined,
  gram21Egp: number | null | undefined,
): number | null {
  if (direct != null && Number.isFinite(direct) && direct > 0) return round4(direct);
  if (gram21Egp != null && Number.isFinite(gram21Egp) && gram21Egp > 0) {
    return round4(gram21Egp * EGYPT_GOLD_POUND_GRAM_WEIGHT);
  }
  return null;
}

function buildGoldPoundRow(
  asOfIso: string,
  parsed: Pick<EgyptParsedPrices, 'gold_pound'>,
  gram21Egp: number | null | undefined,
  quoteCategory: MetalItem['quoteCategory'],
  isStale: boolean,
): MetalItem | null {
  const amountEgp = goldPoundPriceEgp(parsed.gold_pound, gram21Egp);
  if (amountEgp == null) return null;
  return {
    asOf: asOfIso,
    quoteCategory: parsed.gold_pound != null ? 'indicative' : quoteCategory,
    sessionState: 'unknown',
    isStale,
    metal: 'gold',
    unit: 'gold_pound',
    karat: 21,
    amountEgp,
  };
}

function appendGoldPoundRow(
  rows: MetalItem[],
  asOfIso: string,
  parsed: Pick<EgyptParsedPrices, 'gold_pound'>,
  quoteCategory: MetalItem['quoteCategory'],
  isStale: boolean,
): MetalItem[] {
  const gram21 = rows.find((i) => i.metal === 'gold' && i.unit === 'gram' && i.karat === 21)?.amountEgp;
  const pound = buildGoldPoundRow(asOfIso, parsed, gram21, quoteCategory, isStale);
  return pound ? [...rows, pound] : rows;
}

/** Use gram prices from the channel when present; karat rules only fill gaps (e.g. troy oz). */
function applyTelegramGramPriceOverrides(
  goldRows: MetalItem[],
  parsed: Pick<EgyptParsedPrices, 'karat_18' | 'karat_21' | 'karat_24'>,
): MetalItem[] {
  const byKarat: Partial<Record<18 | 21 | 24, number>> = {};
  if (parsed.karat_24 != null) byKarat[24] = parsed.karat_24;
  if (parsed.karat_21 != null) byKarat[21] = parsed.karat_21;
  if (parsed.karat_18 != null) byKarat[18] = parsed.karat_18;

  return goldRows.map((row) => {
    if (row.metal !== 'gold' || row.unit !== 'gram' || row.karat == null) return row;
    const direct = byKarat[row.karat as 18 | 21 | 24];
    if (direct == null) return row;
    return { ...row, amountEgp: round4(direct) };
  });
}

export function isBuiltInMetalsPlaceholder(items: MetalItem[]): boolean {
  const g24 = items.find((i) => i.metal === 'gold' && i.unit === 'gram' && i.karat === 24);
  const g21 = items.find((i) => i.metal === 'gold' && i.unit === 'gram' && i.karat === 21);
  if (!g24 || !g21) return false;
  const expected21 = round4((METALS_PLACEHOLDER_GOLD_24_PER_GRAM * 21) / 24);
  return g24.amountEgp === METALS_PLACEHOLDER_GOLD_24_PER_GRAM && g21.amountEgp === expected21;
}

/** Build API metal rows from a parsed Egyptian Telegram price post. */
export async function metalItemsFromEgyptParsed(
  env: Env,
  parsed: EgyptParsedPrices,
  asOf: Date,
  silverFallbackEgp = 42,
): Promise<MetalItem[]> {
  const k21 = parsed.karat_21!;
  const k24 = parsed.karat_24 ?? (k21 * 24) / 21;
  const asOfSource = parsed.timestamp ? new Date(parsed.timestamp) : asOf;
  const anchor24 = round4(k24);
  let gold = await buildGoldRowsForEnv(env, anchor24, asOfSource, false);
  gold = applyTelegramGramPriceOverrides(gold, parsed);
  const ozOverride = parsed.ounce_egp;
  if (ozOverride != null) {
    const ozIdx = gold.findIndex((i) => i.metal === 'gold' && i.unit === 'troy_ounce');
    if (ozIdx >= 0) {
      gold[ozIdx] = { ...gold[ozIdx]!, amountEgp: round4(ozOverride) };
    }
  }
  const asOfIso = asOfSource.toISOString();

  const silverGram = parsed.silver_local;
  const silver: MetalItem = {
    asOf: asOfIso,
    quoteCategory: silverGram != null ? 'indicative' : 'estimate',
    sessionState: 'unknown',
    isStale: false,
    metal: 'silver',
    unit: 'gram',
    karat: null,
    amountEgp: round4(silverGram ?? silverFallbackEgp),
  };

  return appendGoldPoundRow([...gold, silver], asOfIso, parsed, 'estimate', false);
}

export async function fetchMetals(
  env: Env,
  _egpPerUsd?: number,
  signal?: AbortSignal,
  log?: FastifyBaseLogger,
  telegramBundle?: EgyptTelegramBundle | null,
): Promise<{ items: MetalItem[]; fetchedAt: Date }> {
  const operation = env.METALS_MOCK_JSON ? 'mock' : 'telegram_or_placeholder';
  return observeConnector('metals', operation, async () =>
    fetchMetalsInner(env, _egpPerUsd, signal, log, telegramBundle),
  );
}

async function fetchMetalsInner(
  env: Env,
  _egpPerUsd: number | undefined,
  _signal: AbortSignal | undefined,
  _log: FastifyBaseLogger | undefined,
  telegramBundle?: EgyptTelegramBundle | null,
): Promise<{ items: MetalItem[]; fetchedAt: Date }> {
  if (env.METALS_MOCK_JSON) {
    const raw = JSON.parse(env.METALS_MOCK_JSON) as {
      gold24PerGramEgp?: number;
      silverGramEgp?: number;
    };
    const fetchedAt = new Date();
    if (!raw.gold24PerGramEgp || !raw.silverGramEgp) {
      throw new Error('METALS_MOCK_JSON requires gold24PerGramEgp and silverGramEgp');
    }
    const gold = await buildGoldRowsForEnv(env, raw.gold24PerGramEgp, fetchedAt, false);
    const silver: MetalItem = {
      asOf: fetchedAt.toISOString(),
      quoteCategory: 'indicative',
      sessionState: 'unknown',
      isStale: false,
      metal: 'silver',
      unit: 'gram',
      karat: null,
      amountEgp: round4(raw.silverGramEgp),
    };
    return {
      items: appendGoldPoundRow(
        [...gold, silver],
        fetchedAt.toISOString(),
        { gold_pound: null },
        'indicative',
        false,
      ),
      fetchedAt,
    };
  }

  if (telegramBundle?.parsed.karat_21 != null) {
    return {
      items: await metalItemsFromEgyptParsed(
        env,
        telegramBundle.parsed,
        new Date(telegramBundle.fetchedAt),
        42,
      ),
      fetchedAt: new Date(telegramBundle.fetchedAt),
    };
  }

  void _egpPerUsd;
  const fetchedAt = new Date();
  const placeholderGold24 = METALS_PLACEHOLDER_GOLD_24_PER_GRAM;
  const placeholderSilver = 42;
  const gold = await buildGoldRowsForEnv(env, placeholderGold24, fetchedAt, false);
  const silver: MetalItem = {
    asOf: fetchedAt.toISOString(),
    quoteCategory: 'estimate',
    sessionState: 'unknown',
    isStale: false,
    metal: 'silver',
    unit: 'gram',
    karat: null,
    amountEgp: placeholderSilver,
  };
  return {
    items: appendGoldPoundRow(
      [...gold, silver],
      fetchedAt.toISOString(),
      { gold_pound: null },
      'estimate',
      false,
    ),
    fetchedAt,
  };
}
