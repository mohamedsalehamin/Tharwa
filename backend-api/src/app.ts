import './app-context.js';
import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import type { Env } from './config/env.js';
import type { AppCtx } from './app-context.js';
import { corsPlugin } from './plugins/cors.js';
import { observabilityPlugin } from './plugins/observability.js';
import { publicHttpCachePlugin } from './plugins/public-http-cache.js';
import { publicUploadsPlugin } from './plugins/public-uploads.js';
import { publicMarketRateLimitPlugin } from './plugins/public-rate-limit.js';
import { healthRoutes } from './routes/health.js';
import { metricsRoutes } from './routes/metrics.js';
import { openapiDocRoutes } from './routes/v1/openapi-doc.js';
import { v1MarketRoutes } from './routes/v1/market.js';
import { v1StocksDiscoveryRoutes } from './routes/v1/stocks-discovery.js';
import { v1StocksCuratedRoutes } from './routes/v1/stocks-curated.js';
import { v1AuthRoutes } from './routes/v1/auth.js';
import { v1WatchlistRoutes } from './routes/v1/watchlist.js';
import { v1JournalRoutes } from './routes/v1/journal.js';
import { v1PortfolioRoutes } from './routes/v1/portfolio.js';
import { v1SimRoutes } from './routes/v1/sim.js';
import { v1PriceAlertsRoutes } from './routes/v1/price-alerts.js';
import { v1PushRoutes } from './routes/v1/push.js';
import { v1AnnouncementsRoutes } from './routes/v1/announcements.js';
import { v1ZakatRoutes } from './routes/v1/zakat.js';
import { adminV1Routes } from './routes/admin/v1.js';
import { adminSettingsRoutes } from './routes/admin/settings.js';
import { adminAnnouncementsRoutes } from './routes/admin/announcements.js';

export async function buildApp(env: Env, ctx: AppCtx) {
  // Fastify v5 expects a logger *options* object (or true/false), not a raw Pino instance.
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
    },
    genReqId: (req) => {
      const incoming = req.headers['x-request-id'];
      if (typeof incoming === 'string') {
        const trimmed = incoming.trim();
        if (trimmed.length > 0 && trimmed.length <= 128) return trimmed;
      }
      return randomUUID();
    },
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'reqId',
  });
  app.decorate('ctx', ctx);

  await app.register(observabilityPlugin);
  await app.register(metricsRoutes);
  await app.register(corsPlugin, {
    origins: env.CORS_ORIGINS,
    allowPrivateLanInDev: env.NODE_ENV === 'development',
  });
  await app.register(publicMarketRateLimitPlugin, { env });
  await app.register(publicHttpCachePlugin, { env });
  await app.register(publicUploadsPlugin, { env });
  await app.register(healthRoutes);
  await app.register(openapiDocRoutes, { prefix: '/v1' });
  await app.register(v1MarketRoutes, { prefix: '/v1' });
  await app.register(v1StocksDiscoveryRoutes, { prefix: '/v1' });
  await app.register(v1StocksCuratedRoutes, { prefix: '/v1' });
  await app.register(v1AuthRoutes, { prefix: '/v1' });
  await app.register(v1WatchlistRoutes, { prefix: '/v1' });
  await app.register(v1JournalRoutes, { prefix: '/v1' });
  await app.register(v1PortfolioRoutes, { prefix: '/v1' });
  await app.register(v1SimRoutes, { prefix: '/v1' });
  await app.register(v1PriceAlertsRoutes, { prefix: '/v1' });
  await app.register(v1PushRoutes, { prefix: '/v1' });
  await app.register(v1AnnouncementsRoutes, { prefix: '/v1' });
  await app.register(v1ZakatRoutes, { prefix: '/v1' });
  await app.register(adminV1Routes, { prefix: '/admin/v1' });
  await app.register(adminSettingsRoutes, { prefix: '/admin/v1' });
  await app.register(adminAnnouncementsRoutes, { prefix: '/admin/v1' });

  return app;
}
