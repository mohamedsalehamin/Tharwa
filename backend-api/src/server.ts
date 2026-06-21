import { loadDotEnvFromProject } from './lib/load-dotenv.js';
import { resolveCorsOrigins } from './lib/cors-origins.js';
import { loadEnv } from './config/env.js';
import { buildApp } from './app.js';
import { createLogger } from './lib/logger.js';
import { getRedis, closeRedis } from './lib/redis.js';
import { prisma } from './lib/prisma.js';
import { flushSentry, initObservability } from './observability/index.js';
import { startMetalSnapshotIngest, stopMetalSnapshotIngest } from './jobs/ingest-metal-snapshots.js';
import { startUpstreamPoller, stopUpstreamPoller } from './jobs/poll-upstreams.js';
import {
  startCorporateCalendarSync,
  stopCorporateCalendarSync,
} from './jobs/sync-corporate-calendar.js';
import { startDailyBriefs, stopDailyBriefs } from './jobs/send-daily-briefs.js';
import {
  startNetWorthSnapshots,
  stopNetWorthSnapshots,
} from './jobs/capture-networth-snapshots.js';
import {
  startPriceAlertEvaluator,
  stopPriceAlertEvaluator,
} from './jobs/evaluate-price-alerts.js';
import { startSocialPosts, stopSocialPosts } from './jobs/publish-social-posts.js';

function warnIfProductionCorsMisconfigured(env: Awaited<ReturnType<typeof loadEnv>>, log: ReturnType<typeof createLogger>): void {
  if (env.NODE_ENV !== 'production') return;
  const looksLocalOnly = env.CORS_ORIGINS.every(
    (origin) => origin.includes('localhost') || origin.includes('127.0.0.1'),
  );
  if (looksLocalOnly) {
    log.warn(
      'CORS_ORIGINS still looks like localhost defaults in production — set production origins in aaPanel env or project .env',
    );
  }
}

async function main() {
  const dotenvPath = loadDotEnvFromProject(import.meta.url);
  const env = loadEnv();
  await initObservability(env);
  const log = createLogger(env.NODE_ENV);
  log.info(
    {
      corsOrigins: resolveCorsOrigins(env),
      dotenvPath: dotenvPath ?? null,
    },
    'CORS allow-list loaded',
  );
  warnIfProductionCorsMisconfigured(env, log);
  const redis = getRedis(env.REDIS_URL, log);
  await redis.connect().catch(() => undefined);

  const app = await buildApp(env, { env, redis });

  await app.listen({ port: env.PORT, host: '0.0.0.0' });

  startUpstreamPoller({ env, redis }, log);
  startMetalSnapshotIngest({ env, redis }, log);
  startCorporateCalendarSync({ env, redis }, log);
  startDailyBriefs({ env, redis }, log);
  startNetWorthSnapshots({ env, redis }, log);
  startPriceAlertEvaluator({ env, redis }, log);
  startSocialPosts({ env, redis }, log);

  const shutdown = async () => {
    stopSocialPosts();
    stopPriceAlertEvaluator();
    stopNetWorthSnapshots();
    stopDailyBriefs();
    stopCorporateCalendarSync();
    stopMetalSnapshotIngest();
    stopUpstreamPoller();
    await app.close();
    await closeRedis();
    await prisma.$disconnect();
    await flushSentry();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
