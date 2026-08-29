import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { DISCLAIMER_COMBINED } from '../../i18n/disclaimers.js';
import {
  getPublishedEquityListByCode,
  getSectorHeatmap,
  listPublishedEquityLists,
  listStocksForEquityList,
} from '../../services/equity-lists.js';
import { AppError, sendError } from '../../lib/errors.js';

/** Published EGX equity lists (sectors + thematic). Register before `/stocks/:symbol`. */
export const v1EquityListsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/stocks/egypt/lists/heatmap', async (_req, reply) => {
    try {
      const { items, fetchedAt } = await getSectorHeatmap(
        app.ctx.env,
        app.ctx.redis,
        app.log,
      );
      return reply.send({
        disclaimer: DISCLAIMER_COMBINED,
        fetchedAt,
        items,
      });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });

  app.get('/stocks/egypt/lists', async (_req, reply) => {
    try {
      const lists = await listPublishedEquityLists(app.ctx.redis, app.log);
      return reply.send({
        disclaimer: DISCLAIMER_COMBINED,
        lists,
      });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });

  app.get('/stocks/egypt/lists/:code/stocks', async (req, reply) => {
    try {
      const { code } = req.params as { code: string };
      const parsed = z
        .object({ code: z.string().trim().min(1).max(80) })
        .safeParse({ code });
      if (!parsed.success) {
        throw new AppError('VALIDATION', 'Invalid list code', 400);
      }

      const bundle = await listStocksForEquityList(
        app.ctx.env,
        app.ctx.redis,
        app.log,
        parsed.data.code,
      );
      if (!bundle) {
        throw new AppError('NOT_FOUND', 'List not found', 404);
      }

      return reply.send({
        disclaimer: DISCLAIMER_COMBINED,
        list: bundle.list,
        fetchedAt: bundle.bundleFetchedAt,
        items: bundle.items,
      });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });

  app.get('/stocks/egypt/lists/:code', async (req, reply) => {
    try {
      const { code } = req.params as { code: string };
      const list = await getPublishedEquityListByCode(code);
      if (!list) {
        throw new AppError('NOT_FOUND', 'List not found', 404);
      }
      return reply.send({
        disclaimer: DISCLAIMER_COMBINED,
        list,
      });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });
};
