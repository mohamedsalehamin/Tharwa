import { Redis } from 'ioredis';
import type { FastifyBaseLogger } from 'fastify';
import type { Env } from '../config/env.js';
import { getOrFetchRedisCache } from '../lib/redis-cache.js';
import {
  fetchEgyptMetalsFromTelegramChannel,
  type EgyptParsedPrices,
} from './connectors/telegram-egypt-metals.js';
import { resolveMetalsTelegramCredentials } from './upstream-credentials.js';

const CACHE_KEY = 'cache:egypt-telegram:v1';
const TTL_SEC = 120;
const STALE_AFTER_SEC = 300;
/** Short TTL when Telegram is configured but the channel parse returns nothing. */
const MISS_RETRY_TTL_SEC = 15;

export type EgyptTelegramBundle = {
  parsed: EgyptParsedPrices;
  fetchedAt: string;
};

export async function getEgyptTelegramBundleCached(
  env: Env,
  redis: Redis,
  log: FastifyBaseLogger,
): Promise<EgyptTelegramBundle | null> {
  const creds = await resolveMetalsTelegramCredentials(env);
  if (!creds) return null;

  try {
    const { data } = await getOrFetchRedisCache<EgyptTelegramBundle | null>({
      redis,
      cacheKey: CACHE_KEY,
      freshTtlSec: TTL_SEC,
      staleTtlSec: STALE_AFTER_SEC,
      lockTtlSec: env.REDIS_CACHE_LOCK_TTL_SEC,
      waitMs: env.REDIS_CACHE_WAIT_MS,
      log,
      fetch: async () => {
        const result = await fetchEgyptMetalsFromTelegramChannel({
          botToken: creds.botToken,
          channelId: creds.channelId,
          peekPendingChannelUpdates: creds.peekPendingChannelUpdates,
          log,
        });
        const fetchedAt = new Date().toISOString();
        if (!result) {
          return { fetchedAt, data: null };
        }
        return {
          fetchedAt: result.fetchedAt.toISOString(),
          data: {
            parsed: result.parsed,
            fetchedAt: result.fetchedAt.toISOString(),
          },
        };
      },
      resolveRedisTtlSec: (envelope) => (envelope.data == null ? MISS_RETRY_TTL_SEC : TTL_SEC),
    });
    return data;
  } catch (e) {
    log.warn({ err: e }, 'egypt telegram bundle: cache fetch failed');
    return null;
  }
}
