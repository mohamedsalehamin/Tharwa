import type { FastifyBaseLogger } from 'fastify';
import type { Redis } from 'ioredis';
import type { Env } from '../config/env.js';
import { metalItemToInstrumentCode } from '../lib/metal-instrument-codes.js';
import { quoteForTvId } from './curated-equities.js';
import { resolveTradingViewSymbol } from './connectors/equities.js';
import type { MetalItem } from './connectors/metals.js';
import { isMetalQuoteInstrumentCode } from './metal-instrument-ref.js';
import { getMetalsCached } from './quotes.js';

export type PortfolioQuoteResult = {
  last: number | null;
  asOf: string | null;
};

export function metalPriceFromItems(
  items: MetalItem[],
  instrumentCode: string,
): PortfolioQuoteResult | null {
  if (!isMetalQuoteInstrumentCode(instrumentCode)) return null;
  for (const item of items) {
    const code = metalItemToInstrumentCode(item);
    if (code === instrumentCode) {
      return {
        last: item.amountEgp,
        asOf: item.asOf ?? null,
      };
    }
  }
  return null;
}

export async function quotePortfolioLastPrice(
  cell: { code: string; metadata: unknown },
  quoteCtx: { env: Env; redis: Redis; log: FastifyBaseLogger },
  metalsItems?: MetalItem[],
): Promise<PortfolioQuoteResult> {
  if (isMetalQuoteInstrumentCode(cell.code)) {
    const items =
      metalsItems ??
      (await getMetalsCached(quoteCtx.env, quoteCtx.redis, quoteCtx.log)).items;
    return metalPriceFromItems(items, cell.code) ?? { last: null, asOf: null };
  }

  const tvId = resolveTradingViewSymbol(cell.code, cell.metadata);
  const q = await quoteForTvId(quoteCtx.env, quoteCtx.redis, quoteCtx.log, tvId);
  return { last: q.last, asOf: q.asOf };
}
