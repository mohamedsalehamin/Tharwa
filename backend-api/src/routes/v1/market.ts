import type { FastifyPluginAsync } from 'fastify';
import { DISCLAIMER_COMBINED } from '../../i18n/disclaimers.js';
import { getConsumerMetalsQuotes } from '../../services/consumer-metals-quotes.js';
import { getFxRatesCached } from '../../services/quotes.js';
import { getEgxSessionState } from '../../services/session-egx.js';
import { AppError, sendError } from '../../lib/errors.js';

export const v1MarketRoutes: FastifyPluginAsync = async (app) => {
  app.get('/fx/rates', async (_req, reply) => {
    try {
      const { items } = await getFxRatesCached(app.ctx.env, app.ctx.redis, app.log);
      return reply.send({ disclaimer: DISCLAIMER_COMBINED, items });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });

  app.get('/metals', async (_req, reply) => {
    try {
      const { items } = await getConsumerMetalsQuotes(app.ctx.env, app.ctx.redis, app.log);
      return reply.send({ disclaimer: DISCLAIMER_COMBINED, items });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });

  app.get('/market/summary', async (_req, reply) => {
    try {
      const [fx, metals] = await Promise.all([
        getFxRatesCached(app.ctx.env, app.ctx.redis, app.log),
        getConsumerMetalsQuotes(app.ctx.env, app.ctx.redis, app.log),
      ]);
      return reply.send({
        disclaimer: DISCLAIMER_COMBINED,
        fx: fx.items,
        metals: metals.items,
        indexPlaceholder: null,
        egxSessionState: getEgxSessionState(),
      });
    } catch {
      if (!reply.sent) {
        sendError(reply, new AppError('UPSTREAM', 'Market data temporarily unavailable', 503));
      }
      return;
    }
  });
};
