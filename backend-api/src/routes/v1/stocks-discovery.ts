import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { DISCLAIMER_COMBINED } from '../../i18n/disclaimers.js';
import {
  searchCompaniesCached,
  searchEgyptStocksCached,
  getEgyptIndicesWithQuotesCached,
  searchIndicatorsCached,
  getEgxMoversCached,
} from '../../services/stocks.js';
import { AppError, sendError } from '../../lib/errors.js';

const marketType = z.enum(['stock', 'index', 'crypto', 'forex', 'futures', 'cfd', 'economic']);

const companiesQuery = z.object({
  q: z.string().trim().min(1, 'q is required').max(120),
  type: marketType.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(25),
  offset: z.coerce.number().int().min(0).max(500).default(0),
});

const indicatorsQuery = z.object({
  q: z.string().trim().min(1, 'q is required').max(120),
  limit: z.coerce.number().int().min(1).max(50).default(25),
});

const egyptBrowseQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(50),
  offset: z.coerce.number().int().min(0).max(2000).default(0),
});

const egxMoverList = z.enum(['gainers', 'losers', 'volume', 'unusual']);

const egxMoversQuery = z.object({
  list: egxMoverList.default('gainers'),
  limit: z.coerce.number().int().min(1).max(50).default(25),
  offset: z.coerce.number().int().min(0).max(500).default(0),
  /** When `ar`, each item includes `displayName`: Arabic (or fallback) + ticker, for RTL lists. */
  locale: z.enum(['ar', 'en']).optional(),
});

function zodMessage(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
}

/** TradingView discovery helpers (must register before `/stocks/:symbol` curated routes). */
export const v1StocksDiscoveryRoutes: FastifyPluginAsync = async (app) => {
  app.get('/stocks/egypt/movers', async (req, reply) => {
    try {
      const parsed = egxMoversQuery.safeParse(req.query);
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      }
      const { list, limit, offset, locale } = parsed.data;
      const { items, totalCount, bundleFetchedAt } = await getEgxMoversCached(app.ctx.env, app.ctx.redis, app.log, {
        list,
        limit,
        offset,
      });
      const itemsOut =
        locale === 'ar'
          ? items.map((it) => {
              const ar = it.nameAr?.trim();
              const label = (ar && ar.length > 0 ? ar : it.name).trim();
              const sym = it.symbol.trim();
              return { ...it, displayName: `${label} (${sym})` };
            })
          : items;
      return reply.send({
        disclaimer: DISCLAIMER_COMBINED,
        exchange: 'EGX',
        list,
        limit,
        offset,
        totalCount,
        fetchedAt: bundleFetchedAt,
        items: itemsOut,
      });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });

  app.get('/stocks/egypt/indices', async (req, reply) => {
    try {
      const parsed = egyptBrowseQuery.safeParse(req.query);
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      }
      const { limit, offset } = parsed.data;
      const { items: itemsWithQuotes, bundleFetchedAt } = await getEgyptIndicesWithQuotesCached(
        app.ctx.env,
        app.ctx.redis,
        app.log,
        { limit, offset },
      );
      return reply.send({
        disclaimer: DISCLAIMER_COMBINED,
        exchange: 'EGX',
        assetClass: 'index',
        limit,
        offset,
        fetchedAt: bundleFetchedAt,
        items: itemsWithQuotes,
      });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });

  app.get('/stocks/egypt', async (req, reply) => {
    try {
      const parsed = egyptBrowseQuery.safeParse(req.query);
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      }
      const { limit, offset } = parsed.data;
      const { items, bundleFetchedAt } = await searchEgyptStocksCached(app.ctx.env, app.ctx.redis, app.log, {
        limit,
        offset,
      });
      return reply.send({
        disclaimer: DISCLAIMER_COMBINED,
        exchange: 'EGX',
        assetClass: 'stock',
        limit,
        offset,
        fetchedAt: bundleFetchedAt,
        items,
      });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });

  app.get('/stocks/companies', async (req, reply) => {
    try {
      const parsed = companiesQuery.safeParse(req.query);
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      }
      const { q, type, limit, offset } = parsed.data;
      const { items, bundleFetchedAt } = await searchCompaniesCached(app.ctx.env, app.ctx.redis, app.log, {
        q,
        type,
        limit,
        offset,
      });
      return reply.send({
        disclaimer: DISCLAIMER_COMBINED,
        q,
        type: type ?? null,
        limit,
        offset,
        fetchedAt: bundleFetchedAt,
        items,
      });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });

  app.get('/stocks/indicators', async (req, reply) => {
    try {
      const parsed = indicatorsQuery.safeParse(req.query);
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      }
      const { q, limit } = parsed.data;
      const { items, bundleFetchedAt } = await searchIndicatorsCached(app.ctx.env, app.ctx.redis, app.log, {
        q,
        limit,
      });
      return reply.send({
        disclaimer: DISCLAIMER_COMBINED,
        q,
        limit,
        fetchedAt: bundleFetchedAt,
        items,
      });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });
};
