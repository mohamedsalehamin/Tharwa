import { loadEnv } from './config/env.js';
import { buildApp } from './app.js';
import { createLogger } from './lib/logger.js';
import { getRedis, closeRedis } from './lib/redis.js';
import { prisma } from './lib/prisma.js';
import { flushSentry, initObservability } from './observability/index.js';
import { startUpstreamPoller, stopUpstreamPoller } from './jobs/poll-upstreams.js';

async function main() {
  const env = loadEnv();
  await initObservability(env);
  const log = createLogger(env.NODE_ENV);
  const redis = getRedis(env.REDIS_URL, log);
  await redis.connect().catch(() => undefined);

  const app = await buildApp(env, { env, redis });

  await app.listen({ port: env.PORT, host: '0.0.0.0' });

  startUpstreamPoller({ env, redis }, log);

  const shutdown = async () => {
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
