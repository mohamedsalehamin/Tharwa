import type { FastifyBaseLogger } from 'fastify';
import type { Redis } from 'ioredis';
import type { Env } from '../config/env.js';
import { DISCLAIMER_COMBINED } from '../i18n/disclaimers.js';
import { quoteForTvId } from './curated-equities.js';
import { resolveTradingViewSymbol } from './connectors/equities.js';
import { getOrCreateSimAccount } from './sim-account.js';
import { rollupSimPositions } from './sim-position-rollup.js';
import { prisma } from '../lib/prisma.js';

export const SIM_DISCLAIMER =
  `${DISCLAIMER_COMBINED} Practice trading with virtual EGP only — not executed on EGX, not custody, not investment advice. Fills use indicative last prices.`;

export type SimPortfolioPosition = {
  instrumentId: string;
  code: string;
  displayNameEn: string;
  netQuantity: number;
  averageCost: number | null;
  costBasis: number | null;
  lastPrice: number | null;
  marketValue: number | null;
  unrealizedPl: number | null;
  unrealizedPlPct: number | null;
  quoteAsOf: string | null;
};

export type SimQuoteCtx = {
  env: Env;
  redis: Redis;
  log: FastifyBaseLogger;
};

export async function buildSimPortfolioSummary(
  consumerUserId: string,
  quoteCtx?: SimQuoteCtx,
): Promise<{
  disclaimer: string;
  startingCashEgp: number;
  cashEgp: number;
  holdingsValueEgp: number;
  totalValueEgp: number;
  totalPlEgp: number;
  totalPlPct: number | null;
  positions: SimPortfolioPosition[];
}> {
  if (!quoteCtx) {
    throw new Error('buildSimPortfolioSummary requires quoteCtx');
  }
  const account = await getOrCreateSimAccount(consumerUserId, quoteCtx.env);
  const starting = account.startingCashEgp.toNumber();
  const cash = account.cashEgp.toNumber();

  const trades = await prisma.simTrade.findMany({
    where: { simAccountId: account.id },
    orderBy: [{ filledAt: 'asc' }, { createdAt: 'asc' }],
    include: {
      instrument: { select: { code: true, displayNameEn: true, metadata: true } },
    },
  });

  const rolled = rollupSimPositions(
    trades.map((t) => ({
      instrumentId: t.instrumentId,
      code: t.instrument.code,
      displayNameEn: t.instrument.displayNameEn,
      metadata: t.instrument.metadata,
      side: t.side,
      quantity: t.quantity,
      fillPriceEgp: t.fillPriceEgp,
    })),
  );

  const positions: SimPortfolioPosition[] = [];
  let holdingsValue = 0;

  for (const cell of rolled) {
    if (Math.abs(cell.qty) < 1e-12 && cell.cost < 1e-9) continue;
    const avg = cell.qty > 1e-12 ? cell.cost / cell.qty : null;
    const costBasis = cell.qty > 1e-12 ? cell.cost : null;

    let lastPrice: number | null = null;
    let marketValue: number | null = null;
    let unrealizedPl: number | null = null;
    let unrealizedPlPct: number | null = null;
    let quoteAsOf: string | null = null;

    if (quoteCtx && cell.qty > 1e-12) {
      try {
        const tvId = resolveTradingViewSymbol(cell.code, cell.metadata);
        const q = await quoteForTvId(quoteCtx.env, quoteCtx.redis, quoteCtx.log, tvId);
        lastPrice = q.last;
        quoteAsOf = q.asOf;
        if (lastPrice != null && Number.isFinite(lastPrice)) {
          marketValue = lastPrice * cell.qty;
          holdingsValue += marketValue;
          if (costBasis != null) {
            unrealizedPl = marketValue - costBasis;
          }
          if (avg != null && avg > 0) {
            unrealizedPlPct = ((lastPrice - avg) / avg) * 100;
          }
        }
      } catch {
        /* indicative quote optional */
      }
    }

    positions.push({
      instrumentId: cell.instrumentId,
      code: cell.code,
      displayNameEn: cell.displayNameEn,
      netQuantity: cell.qty,
      averageCost: avg,
      costBasis,
      lastPrice,
      marketValue,
      unrealizedPl,
      unrealizedPlPct,
      quoteAsOf,
    });
  }

  const totalValue = cash + holdingsValue;
  const totalPl = totalValue - starting;
  const totalPlPct = starting > 0 ? (totalPl / starting) * 100 : null;

  return {
    disclaimer: SIM_DISCLAIMER,
    startingCashEgp: starting,
    cashEgp: cash,
    holdingsValueEgp: holdingsValue,
    totalValueEgp: totalValue,
    totalPlEgp: totalPl,
    totalPlPct,
    positions,
  };
}
