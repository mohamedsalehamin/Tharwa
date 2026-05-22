import type { FastifyPluginAsync } from 'fastify';
import type { AppCtx } from '../../app-context.js';
import { AppError, sendError } from '../../lib/errors.js';
import { consumerBearerPreHandler } from '../../plugins/consumer-bearer.js';
import { buildPortfolioSummary, deletePortfolioPosition } from '../../services/portfolio.js';

export const v1PortfolioRoutes: FastifyPluginAsync = async (app) => {
  const ctx = (): AppCtx => app.ctx;
  const guard = { preHandler: consumerBearerPreHandler(ctx().env) };

  app.get('/portfolio/summary', { ...guard }, async (req, reply) => {
    try {
      const userId = req.consumer!.id;
      const c = ctx();
      const summary = await buildPortfolioSummary(userId, {
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

  app.delete('/portfolio/positions/:instrumentId', { ...guard }, async (req, reply) => {
    try {
      const userId = req.consumer!.id;
      const { instrumentId } = req.params as { instrumentId: string };
      if (!/^[0-9a-f-]{36}$/i.test(instrumentId)) {
        throw new AppError('VALIDATION', 'Invalid instrument id', 400);
      }
      await deletePortfolioPosition(userId, instrumentId);
      return reply.status(204).send();
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });
};
