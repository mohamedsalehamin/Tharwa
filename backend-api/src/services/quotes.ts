import { Redis } from 'ioredis';
import type { FastifyBaseLogger } from 'fastify';
import type { Env } from '../config/env.js';
import { getOrFetchRedisCache } from '../lib/redis-cache.js';
import { fetchFxRates, type FxRateItem } from './connectors/fx.js';
import { fetchMetals, isBuiltInMetalsPlaceholder, type MetalItem } from './connectors/metals.js';
import { getEgyptTelegramBundleCached } from './egypt-telegram-bundle.js';
import { applyFxPresentation, applyMetalsPresentation } from './instrument-presentation.js';

const TTL_SEC = 120;
/** When Telegram is configured but the connector still returns built-in placeholders, avoid long Redis lock-in. */
const METALS_PLACEHOLDER_RETRY_TTL_SEC = 15;
const STALE_AFTER_SEC = 300;

type FxCacheData = { items: FxRateItem[] };
type MetalsCacheData = { items: MetalItem[] };

function ageSec(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 1000;
}

function applyStale<T extends { asOf: string; isStale: boolean }>(items: T[], bundleFetchedAt: string): T[] {
  const stale = ageSec(bundleFetchedAt) > STALE_AFTER_SEC;
  return items.map((i) => ({
    ...i,
    isStale: stale || i.isStale,
  }));
}

export async function getFxRatesCached(
  env: Env,
  redis: Redis,
  log: FastifyBaseLogger,
): Promise<{ items: FxRateItem[]; disclaimer: string; bundleFetchedAt: string }> {
  const { data, fetchedAt } = await getOrFetchRedisCache<FxCacheData>({
    redis,
    cacheKey: 'cache:fx:v1',
    freshTtlSec: TTL_SEC,
    staleTtlSec: STALE_AFTER_SEC,
    lockTtlSec: env.REDIS_CACHE_LOCK_TTL_SEC,
    waitMs: env.REDIS_CACHE_WAIT_MS,
    log,
    fetch: async () => {
      const tgBundle = await getEgyptTelegramBundleCached(env, redis, log);
      const { items, fetchedAt: at } = await fetchFxRates(env, undefined, tgBundle);
      return { fetchedAt: at.toISOString(), data: { items } };
    },
  });

  const staleItems = applyStale(data.items, fetchedAt);
  const items = await applyFxPresentation(staleItems);

  return {
    items,
    disclaimer: '',
    bundleFetchedAt: fetchedAt,
  };
}

export async function getMetalsCached(
  env: Env,
  redis: Redis,
  log: FastifyBaseLogger,
): Promise<{ items: MetalItem[]; bundleFetchedAt: string }> {
  const tgConfigured = Boolean(
    env.TELEGRAM_METALS_BOT_TOKEN?.trim() && env.TELEGRAM_METALS_CHANNEL_ID?.trim(),
  );

  const { data, fetchedAt } = await getOrFetchRedisCache<MetalsCacheData>({
    redis,
    cacheKey: 'cache:metals:v1',
    freshTtlSec: TTL_SEC,
    staleTtlSec: STALE_AFTER_SEC,
    lockTtlSec: env.REDIS_CACHE_LOCK_TTL_SEC,
    waitMs: env.REDIS_CACHE_WAIT_MS,
    log,
    fetch: async () => {
      const tgBundle = await getEgyptTelegramBundleCached(env, redis, log);
      const { items, fetchedAt: at } = await fetchMetals(env, undefined, undefined, log, tgBundle);
      return { fetchedAt: at.toISOString(), data: { items } };
    },
    resolveRedisTtlSec: (envelope) => {
      if (tgConfigured && isBuiltInMetalsPlaceholder(envelope.data.items)) {
        log.warn(
          { ttlSec: METALS_PLACEHOLDER_RETRY_TTL_SEC, channelId: env.TELEGRAM_METALS_CHANNEL_ID?.trim() },
          'metals: Telegram env set but response matches built-in placeholders — short Redis TTL',
        );
        return METALS_PLACEHOLDER_RETRY_TTL_SEC;
      }
      return TTL_SEC;
    },
  });

  const staleItems = applyStale(data.items, fetchedAt);
  const items = await applyMetalsPresentation(env, staleItems);

  return {
    items,
    bundleFetchedAt: fetchedAt,
  };
}
