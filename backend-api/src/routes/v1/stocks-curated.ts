import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { DISCLAIMER_COMBINED } from '../../i18n/disclaimers.js';
import {
  getCuratedEquityDetail,
  getCuratedEquityHistory,
  getCuratedEquitySparkline,
  listMarketEgxStocksCached,
  normalizeEquitySymbolParam,
  type EquitySparkline,
} from '../../services/curated-equities.js';
import { enrichEquityDetailWithScanner } from '../../services/equity-profile-enrichment.js';
import {
  defaultCalendarRange,
  listCorporateCalendarForSymbol,
  parseCalendarDateParam,
} from '../../services/corporate-calendar.js';
import { AppError, sendError } from '../../lib/errors.js';

const historyRangeSchema = z.enum(['1d', '1w', '1m', '1y']);

const historyQuery = z.object({
  range: historyRangeSchema.default('1m'),
});

const SPARKLINES_MAX_SYMBOLS = 25;

const sparklinesQuery = z.object({
  symbols: z.string().min(1),
  range: historyRangeSchema.default('1m'),
});

function staleSparkline(symbol: string, range: z.infer<typeof historyRangeSchema>): EquitySparkline {
  return { symbol, range, closes: [], asOf: null, changePct: null, isStale: true };
}

function zodMessage(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
}

/** OpenAPI-aligned curated EGX list + detail + history (DB instruments + TradingView chart). */
export const v1StocksCuratedRoutes: FastifyPluginAsync = async (app) => {
  app.get('/stocks', async (_req, reply) => {
    try {
      const { items, bundleFetchedAt } = await listMarketEgxStocksCached(app.ctx.env, app.ctx.redis, app.log);
      return reply.send({
        disclaimer: DISCLAIMER_COMBINED,
        fetchedAt: bundleFetchedAt,
        items,
      });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });

  app.get('/stocks/sparklines', async (req, reply) => {
    try {
      const parsed = sparklinesQuery.safeParse(req.query);
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      }
      if (!app.ctx.env.EQUITIES_TV_ENABLED) {
        throw new AppError('UPSTREAM', 'Equity chart data disabled', 503);
      }
      const { range } = parsed.data;
      const symbols = [
        ...new Set(
          parsed.data.symbols
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s.length > 0),
        ),
      ];
      if (symbols.length === 0) {
        throw new AppError('VALIDATION', 'symbols must contain at least one ticker', 400);
      }
      if (symbols.length > SPARKLINES_MAX_SYMBOLS) {
        throw new AppError('VALIDATION', `at most ${SPARKLINES_MAX_SYMBOLS} symbols per request`, 400);
      }

      const items = await Promise.all(
        symbols.map(async (sym) => {
          try {
            const spark = await getCuratedEquitySparkline(app.ctx.env, app.ctx.redis, app.log, sym, range);
            return spark ?? staleSparkline(normalizeEquitySymbolParam(sym), range);
          } catch (e) {
            app.log.warn({ e, sym }, 'equity sparkline failed');
            return staleSparkline(normalizeEquitySymbolParam(sym), range);
          }
        }),
      );

      return reply.send({
        disclaimer: DISCLAIMER_COMBINED,
        range,
        items,
      });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });

  app.get('/stocks/:symbol/history', async (req, reply) => {
    try {
      const parsed = historyQuery.safeParse(req.query);
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      }
      const { range } = parsed.data;
      if (!app.ctx.env.EQUITIES_TV_ENABLED) {
        throw new AppError('UPSTREAM', 'Equity chart data disabled', 503);
      }
      const { symbol } = req.params as { symbol: string };
      const bundle = await getCuratedEquityHistory(app.ctx.env, app.ctx.redis, app.log, symbol, range);
      if (!bundle) {
        throw new AppError('NOT_FOUND', 'Unknown symbol', 404);
      }
      return reply.send({
        disclaimer: DISCLAIMER_COMBINED,
        symbol: bundle.symbol,
        resolution: bundle.resolution,
        points: bundle.points,
      });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });

  app.get('/stocks/:symbol/calendar', async (req, reply) => {
    try {
      const { symbol } = req.params as { symbol: string };
      const defaults = defaultCalendarRange();
      const from = parseCalendarDateParam(
        (req.query as { from?: string }).from,
        defaults.from,
      );
      const to = parseCalendarDateParam((req.query as { to?: string }).to, defaults.to);
      const limitRaw = (req.query as { limit?: string }).limit;
      const limit = limitRaw ? Math.min(20, Math.max(1, Number.parseInt(limitRaw, 10) || 5)) : 5;

      const row = await getCuratedEquityDetail(app.ctx.env, app.ctx.redis, app.log, symbol);
      if (!row) {
        throw new AppError('NOT_FOUND', 'Unknown symbol', 404);
      }

      const { events, fetchedAt } = await listCorporateCalendarForSymbol(symbol, from, to, limit);
      return reply.send({
        disclaimer: DISCLAIMER_COMBINED,
        symbol: row.symbol,
        fetchedAt,
        events,
      });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });

  app.get('/stocks/:symbol', async (req, reply) => {
    try {
      const { symbol } = req.params as { symbol: string };
      const row = await getCuratedEquityDetail(app.ctx.env, app.ctx.redis, app.log, symbol);
      if (!row) {
        throw new AppError('NOT_FOUND', 'Unknown symbol', 404);
      }
      const enriched = await enrichEquityDetailWithScanner(app.ctx.env, app.ctx.redis, app.log, row);
      return reply.send({
        disclaimer: DISCLAIMER_COMBINED,
        ...enriched,
      });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });
};
