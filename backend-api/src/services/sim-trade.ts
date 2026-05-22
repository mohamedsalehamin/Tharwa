import { InstrumentKind, Prisma } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import type { Redis } from 'ioredis';
import type { Env } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { quoteForTvId } from './curated-equities.js';
import { resolveTradingViewSymbol } from './connectors/equities.js';
import { resolveEquityInstrumentId, type EquityInstrumentRef } from './equity-instrument-ref.js';
import { getOrCreateSimAccount } from './sim-account.js';
import { netSimQuantity } from './sim-position-rollup.js';

export type SimQuoteCtx = {
  env: Env;
  redis: Redis;
  log: FastifyBaseLogger;
};

export async function executeSimTrade(
  consumerUserId: string,
  ref: EquityInstrumentRef & { side: 'buy' | 'sell'; quantity: number },
  quoteCtx: SimQuoteCtx,
): Promise<{
  trade: {
    id: string;
    instrumentId: string;
    code: string;
    displayNameEn: string;
    side: string;
    quantity: string;
    fillPriceEgp: string;
    quoteAsOf: string | null;
    filledAt: string;
  };
  cashEgp: string;
}> {
  const qty = Math.floor(ref.quantity);
  if (!Number.isFinite(qty) || qty < 1) {
    throw new AppError('VALIDATION', 'Quantity must be a whole number of at least 1', 400);
  }

  const instrumentId = await resolveEquityInstrumentId(ref);
  if (!instrumentId) {
    throw new AppError('NOT_FOUND', 'Instrument not found', 404);
  }

  const inst = await prisma.instrument.findFirst({
    where: { id: instrumentId, kind: InstrumentKind.equity },
  });
  if (!inst) {
    throw new AppError('NOT_FOUND', 'Equity instrument not found', 404);
  }

  if (!quoteCtx.env.EQUITIES_TV_ENABLED) {
    throw new AppError('UPSTREAM', 'Market quotes unavailable for practice trading', 503);
  }

  const tvId = resolveTradingViewSymbol(inst.code, inst.metadata);
  const q = await quoteForTvId(quoteCtx.env, quoteCtx.redis, quoteCtx.log, tvId);
  if (q.last == null || !Number.isFinite(q.last) || q.last <= 0) {
    throw new AppError('UPSTREAM', 'No indicative price available for this symbol', 503);
  }

  const quoteMs = new Date(q.asOf).getTime();
  if (!Number.isFinite(quoteMs)) {
    throw new AppError('UPSTREAM', 'Invalid quote timestamp', 503);
  }
  const ageSec = (Date.now() - quoteMs) / 1000;
  if (ageSec > quoteCtx.env.SIM_MAX_QUOTE_AGE_SEC) {
    throw new AppError(
      'UPSTREAM',
      `Quote is too stale for practice trading (max ${quoteCtx.env.SIM_MAX_QUOTE_AGE_SEC}s)`,
      503,
    );
  }

  const fillPrice = q.last;
  const notional = qty * fillPrice;

  return prisma.$transaction(async (tx) => {
    const account = await getOrCreateSimAccount(consumerUserId, quoteCtx.env, tx);

    const prior = await tx.simTrade.findMany({
      where: { simAccountId: account.id, instrumentId },
      select: { side: true, quantity: true },
    });

    if (ref.side === 'sell') {
      const net = netSimQuantity(prior);
      if (qty > net + 1e-9) {
        throw new AppError('VALIDATION', 'Sell quantity exceeds practice position', 400);
      }
    } else {
      const cash = account.cashEgp.toNumber();
      if (notional > cash + 1e-6) {
        throw new AppError('VALIDATION', 'Insufficient virtual cash for this buy', 400);
      }
    }

    const cashBefore = account.cashEgp.toNumber();
    const cashAfter =
      ref.side === 'buy' ? cashBefore - notional : cashBefore + notional;

    await tx.simAccount.update({
      where: { id: account.id },
      data: { cashEgp: new Prisma.Decimal(String(cashAfter)) },
    });

    const row = await tx.simTrade.create({
      data: {
        simAccountId: account.id,
        instrumentId,
        side: ref.side,
        quantity: new Prisma.Decimal(String(qty)),
        fillPriceEgp: new Prisma.Decimal(String(fillPrice)),
        quoteAsOf: new Date(q.asOf),
        filledAt: new Date(),
      },
      include: { instrument: { select: { code: true, displayNameEn: true } } },
    });

    return {
      trade: {
        id: row.id,
        instrumentId: row.instrumentId,
        code: row.instrument.code,
        displayNameEn: row.instrument.displayNameEn,
        side: row.side,
        quantity: row.quantity.toString(),
        fillPriceEgp: row.fillPriceEgp.toString(),
        quoteAsOf: row.quoteAsOf?.toISOString() ?? null,
        filledAt: row.filledAt.toISOString(),
      },
      cashEgp: String(cashAfter),
    };
  });
}
