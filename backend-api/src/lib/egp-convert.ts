import type { FastifyBaseLogger } from 'fastify';
import type { Redis } from 'ioredis';
import type { Env } from '../config/env.js';
import type { FxRateItem } from '../services/connectors/fx.js';
import { getFxRatesCached } from '../services/quotes.js';

export type EgpConversion = {
  /** Converted EGP value, or null when the currency cannot be resolved. */
  amountEgp: number | null;
  asOf: string | null;
  isStale: boolean;
};

export type EgpConverter = (amount: number, currency: string) => EgpConversion;

const EGP_CODES = new Set(['EGP', 'egp']);

/**
 * Build a synchronous EGP converter from already-fetched FX items.
 * FX `rate` is EGP per 1 unit of `baseCurrency` (e.g. USD rate 49 ⇒ 1 USD = 49 EGP).
 */
export function buildEgpConverter(fxItems: FxRateItem[]): EgpConverter {
  const byCurrency = new Map<string, FxRateItem>();
  for (const it of fxItems) {
    byCurrency.set(it.baseCurrency.toUpperCase(), it);
  }

  return (amount: number, currency: string): EgpConversion => {
    const code = (currency || 'EGP').trim().toUpperCase();
    if (EGP_CODES.has(code)) {
      return { amountEgp: amount, asOf: null, isStale: false };
    }
    const fx = byCurrency.get(code);
    if (!fx || !Number.isFinite(fx.rate)) {
      return { amountEgp: null, asOf: null, isStale: true };
    }
    return { amountEgp: amount * fx.rate, asOf: fx.asOf ?? null, isStale: fx.isStale };
  };
}

/** Fetch FX once (cached) and return a converter plus the source freshness. */
export async function getEgpConverter(
  env: Env,
  redis: Redis,
  log: FastifyBaseLogger,
): Promise<{ convert: EgpConverter; items: FxRateItem[] }> {
  const { items } = await getFxRatesCached(env, redis, log);
  return { convert: buildEgpConverter(items), items };
}
