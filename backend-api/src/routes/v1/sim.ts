import type { FastifyPluginAsync } from 'fastify';
import type { AppCtx } from '../../app-context.js';
import { AppError, sendError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { consumerBearerPreHandler } from '../../plugins/consumer-bearer.js';
import { resetSimAccount } from '../../services/sim-account.js';
import { buildSimPortfolioSummary } from '../../services/sim-portfolio.js';
import { executeSimTrade } from '../../services/sim-trade.js';
import { simTradeCreateBody, zodSimMessage } from '../../services/sim-validation.js';

export const v1SimRoutes: FastifyPluginAsync = async (app) => {
  const ctx = (): AppCtx => app.ctx;
  const guard = { preHandler: consumerBearerPreHandler(ctx().env) };

  app.get('/sim/portfolio/summary', { ...guard }, async (req, reply) => {
    try {
      const userId = req.consumer!.id;
      const c = ctx();
      const summary = await buildSimPortfolioSummary(userId, {
        env: c.env,
        redis: c.redis,
        log: app.log,
      });
      return reply.send(summary);
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });

  app.get('/sim/trades', { ...guard }, async (req, reply) => {
    try {
      const userId = req.consumer!.id;
      const account = await prisma.simAccount.findUnique({
        where: { consumerUserId: userId },
      });
      if (!account) {
        return reply.send({ items: [] });
      }
      const rows = await prisma.simTrade.findMany({
        where: { simAccountId: account.id },
        orderBy: [{ filledAt: 'desc' }, { createdAt: 'desc' }],
        include: { instrument: { select: { code: true, displayNameEn: true } } },
      });
      return reply.send({
        items: rows.map((r) => ({
          id: r.id,
          instrumentId: r.instrumentId,
          code: r.instrument.code,
          displayNameEn: r.instrument.displayNameEn,
          side: r.side,
          quantity: r.quantity.toString(),
          fillPriceEgp: r.fillPriceEgp.toString(),
          quoteAsOf: r.quoteAsOf?.toISOString() ?? null,
          filledAt: r.filledAt.toISOString(),
        })),
      });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });

  app.post('/sim/trades', { ...guard }, async (req, reply) => {
    try {
      const userId = req.consumer!.id;
      const parsed = simTradeCreateBody.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodSimMessage(parsed.error), 400);
      }
      const c = ctx();
      const result = await executeSimTrade(userId, parsed.data, {
        env: c.env,
        redis: c.redis,
        log: app.log,
      });
      return reply.status(201).send(result);
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });

  app.post('/sim/account/reset', { ...guard }, async (req, reply) => {
    try {
      const userId = req.consumer!.id;
      const body = await resetSimAccount(userId, ctx().env);
      return reply.send(body);
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });
};
