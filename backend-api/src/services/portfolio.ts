import { Prisma } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import type { Redis } from 'ioredis';
import type { Env } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { DISCLAIMER_COMBINED } from '../i18n/disclaimers.js';
import type { MetalItem } from './connectors/metals.js';
import { isMetalQuoteInstrumentCode } from './metal-instrument-ref.js';
import { quotePortfolioLastPrice } from './portfolio-quotes.js';
import { getMetalsCached } from './quotes.js';

export type PortfolioPosition = {
  instrumentId: string;
  code: string;
  displayNameEn: string;
  netQuantity: number;
  averageCost: number | null;
  costBasis: number | null;
  /** Indicative last / session close from market data (EGP per share). */
  lastPrice: number | null;
  marketValue: number | null;
  unrealizedPl: number | null;
  unrealizedPlPct: number | null;
  quoteAsOf: string | null;
};

export type PortfolioQuoteCtx = {
  env: Env;
  redis: Redis;
  log: FastifyBaseLogger;
};

export async function buildPortfolioSummary(
  consumerUserId: string,
  quoteCtx?: PortfolioQuoteCtx,
): Promise<{
  disclaimer: string;
  positions: PortfolioPosition[];
}> {
  const entries = await prisma.tradeJournalEntry.findMany({
    where: { consumerUserId },
    orderBy: [{ executedAt: 'asc' }, { createdAt: 'asc' }],
    include: { instrument: { select: { code: true, displayNameEn: true, metadata: true } } },
  });

  const byInstrument = new Map<
    string,
    { code: string; displayNameEn: string; metadata: unknown; qty: number; cost: number }
  >();

  for (const e of entries) {
    const iid = e.instrumentId;
    let cell = byInstrument.get(iid);
    if (!cell) {
      cell = {
        code: e.instrument.code,
        displayNameEn: e.instrument.displayNameEn,
        metadata: e.instrument.metadata,
        qty: 0,
        cost: 0,
      };
    }
    const q = new Prisma.Decimal(e.quantity).toNumber();
    const p = new Prisma.Decimal(e.price).toNumber();
    if (e.side === 'buy') {
      cell.cost += q * p;
      cell.qty += q;
    } else {
      const avg = cell.qty > 0 ? cell.cost / cell.qty : 0;
      const sell = Math.min(q, cell.qty);
      cell.cost -= avg * sell;
      cell.qty -= q;
    }
    byInstrument.set(iid, cell);
  }

  const positions: PortfolioPosition[] = [];
  let metalsItems: MetalItem[] | undefined;
  const hasMetalPositions = quoteCtx
    ? [...byInstrument.values()].some(
        (cell) => Math.abs(cell.qty) > 1e-12 && isMetalQuoteInstrumentCode(cell.code),
      )
    : false;
  if (quoteCtx && hasMetalPositions) {
    try {
      metalsItems = (await getMetalsCached(quoteCtx.env, quoteCtx.redis, quoteCtx.log)).items;
    } catch {
      metalsItems = undefined;
    }
  }

  for (const [instrumentId, cell] of byInstrument) {
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
        const q = await quotePortfolioLastPrice(cell, quoteCtx, metalsItems);
        lastPrice = q.last;
        quoteAsOf = q.asOf;
        if (lastPrice != null && Number.isFinite(lastPrice)) {
          marketValue = lastPrice * cell.qty;
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
      instrumentId,
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

  return {
    disclaimer: `${DISCLAIMER_COMBINED} Self-reported journal only; not executed trades or custody. P/L vs indicative last price is illustrative only.`,
    positions,
  };
}

export async function deletePortfolioPosition(
  consumerUserId: string,
  instrumentId: string,
): Promise<void> {
  const deleted = await prisma.tradeJournalEntry.deleteMany({
    where: { consumerUserId, instrumentId },
  });
  if (deleted.count === 0) {
    throw new AppError('NOT_FOUND', 'No journal entries for this position', 404);
  }
}
