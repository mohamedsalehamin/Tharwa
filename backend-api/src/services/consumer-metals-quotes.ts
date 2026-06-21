import type { Redis } from 'ioredis';
import type { FastifyBaseLogger } from 'fastify';
import type { Env } from '../config/env.js';
import type { MetalItem } from './connectors/metals.js';
import { getMetalsCached } from './quotes.js';

/** Same bundle as GET /v1/metals and the metals block in GET /v1/market/summary. */
export async function getConsumerMetalsQuotes(
  env: Env,
  redis: Redis,
  log: FastifyBaseLogger,
): Promise<{ items: MetalItem[]; bundleFetchedAt: string }> {
  return getMetalsCached(env, redis, log);
}

function goldGramByKarat(items: MetalItem[], karat: 18 | 21 | 24): number | null {
  const row = items.find((i) => i.metal === 'gold' && i.unit === 'gram' && i.karat === karat);
  return row && Number.isFinite(row.amountEgp) ? row.amountEgp : null;
}

/** Read displayed gold/silver prices from consumer API rows (same fields the mobile app renders). */
export function extractGoldSocialPrices(items: MetalItem[]): {
  gold18: number | null;
  gold21: number | null;
  gold24: number | null;
  goldOunce: number | null;
  goldPound: number | null;
} {
  const directPound = items.find((i) => i.unit === 'gold_pound');
  const goldPound =
    directPound && Number.isFinite(directPound.amountEgp)
      ? directPound.amountEgp
      : (() => {
          const k21 = goldGramByKarat(items, 21);
          return k21 != null ? Math.round(k21 * 8) : null;
        })();

  const ounceRow = items.find((i) => i.metal === 'gold' && i.unit === 'troy_ounce');

  return {
    gold18: goldGramByKarat(items, 18),
    gold21: goldGramByKarat(items, 21),
    gold24: goldGramByKarat(items, 24),
    goldOunce: ounceRow && Number.isFinite(ounceRow.amountEgp) ? ounceRow.amountEgp : null,
    goldPound,
  };
}
