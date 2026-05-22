import type { Redis } from 'ioredis';
import type { FastifyBaseLogger } from 'fastify';

export type CacheEnvelope<T> = { fetchedAt: string; data: T };

export type CacheFreshness = 'fresh' | 'stale' | 'origin';

export type GetOrFetchRedisCacheOptions<T> = {
  redis: Redis;
  cacheKey: string;
  freshTtlSec: number;
  /** Serve (and return on upstream failure) up to this age. Default 300s. */
  staleTtlSec?: number;
  lockTtlSec?: number;
  waitMs?: number;
  log: FastifyBaseLogger;
  fetch: () => Promise<CacheEnvelope<T>>;
  /** Override Redis EX after fetch (e.g. short TTL for placeholder metals). */
  resolveRedisTtlSec?: (envelope: CacheEnvelope<T>) => number;
};

const inflight = new Map<string, Promise<CacheEnvelope<unknown>>>();

function ageSec(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 1000;
}

function lockKey(cacheKey: string): string {
  return `lock:${cacheKey}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseEnvelope<T>(raw: string): CacheEnvelope<T> | null {
  try {
    const parsed = JSON.parse(raw) as CacheEnvelope<T> & { at?: string };
    const fetchedAt = parsed.fetchedAt ?? parsed.at;
    if (typeof fetchedAt === 'string' && parsed.data !== undefined) {
      return { fetchedAt, data: parsed.data };
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function readEnvelope<T>(redis: Redis, cacheKey: string): Promise<CacheEnvelope<T> | null> {
  const raw = await redis.get(cacheKey);
  if (!raw) return null;
  return parseEnvelope<T>(raw);
}

function classifyFreshness(fetchedAt: string, freshTtlSec: number, staleTtlSec: number): CacheFreshness | null {
  const age = ageSec(fetchedAt);
  if (age < freshTtlSec) return 'fresh';
  if (age < staleTtlSec) return 'stale';
  return null;
}

async function waitForCacheFill<T>(
  redis: Redis,
  cacheKey: string,
  freshTtlSec: number,
  staleTtlSec: number,
  waitMs: number,
): Promise<CacheEnvelope<T> | null> {
  const deadline = Date.now() + waitMs;
  const lk = lockKey(cacheKey);
  while (Date.now() < deadline) {
    const env = await readEnvelope<T>(redis, cacheKey);
    if (env && classifyFreshness(env.fetchedAt, freshTtlSec, staleTtlSec)) return env;
    const lockHeld = await redis.exists(lk);
    if (!lockHeld) break;
    await sleep(75);
  }
  const env = await readEnvelope<T>(redis, cacheKey);
  if (env && classifyFreshness(env.fetchedAt, freshTtlSec, staleTtlSec)) return env;
  return null;
}

async function leaderFetch<T>(opts: GetOrFetchRedisCacheOptions<T>): Promise<CacheEnvelope<T>> {
  const staleTtlSec = opts.staleTtlSec ?? 300;
  const fresh = await readEnvelope<T>(opts.redis, opts.cacheKey);
  if (fresh && classifyFreshness(fresh.fetchedAt, opts.freshTtlSec, staleTtlSec) === 'fresh') {
    return fresh;
  }

  try {
    const envelope = await opts.fetch();
    const ttl = opts.resolveRedisTtlSec?.(envelope) ?? opts.freshTtlSec;
    await opts.redis.set(opts.cacheKey, JSON.stringify(envelope), 'EX', ttl);
    return envelope;
  } catch (e) {
    const stale = await readEnvelope<T>(opts.redis, opts.cacheKey);
    if (stale && classifyFreshness(stale.fetchedAt, opts.freshTtlSec, staleTtlSec) === 'stale') {
      opts.log.warn({ err: e, cacheKey: opts.cacheKey }, 'upstream fetch failed; serving stale cache');
      return stale;
    }
    throw e;
  }
}

async function runDistributedSingleFlight<T>(opts: GetOrFetchRedisCacheOptions<T>): Promise<CacheEnvelope<T>> {
  const lk = lockKey(opts.cacheKey);
  const lockTtlSec = opts.lockTtlSec ?? 45;
  const waitMs = opts.waitMs ?? 25_000;
  const staleTtlSec = opts.staleTtlSec ?? 300;

  const acquired = await opts.redis.set(lk, '1', 'EX', lockTtlSec, 'NX');
  if (acquired === 'OK') {
    try {
      return await leaderFetch(opts);
    } finally {
      await opts.redis.del(lk).catch(() => undefined);
    }
  }

  const filled = await waitForCacheFill<T>(opts.redis, opts.cacheKey, opts.freshTtlSec, staleTtlSec, waitMs);
  if (filled) return filled;

  const retry = await opts.redis.set(lk, '1', 'EX', lockTtlSec, 'NX');
  if (retry === 'OK') {
    try {
      return await leaderFetch(opts);
    } finally {
      await opts.redis.del(lk).catch(() => undefined);
    }
  }

  const stale = await readEnvelope<T>(opts.redis, opts.cacheKey);
  if (stale && classifyFreshness(stale.fetchedAt, opts.freshTtlSec, staleTtlSec) === 'stale') {
    return stale;
  }

  const finalWait = await waitForCacheFill<T>(opts.redis, opts.cacheKey, opts.freshTtlSec, staleTtlSec, 5000);
  if (finalWait) return finalWait;

  throw new Error(`cache single-flight timeout for ${opts.cacheKey}`);
}

/**
 * Redis cache with in-process + distributed single-flight on miss/expiry.
 */
export async function getOrFetchRedisCache<T>(
  opts: GetOrFetchRedisCacheOptions<T>,
): Promise<{ data: T; fetchedAt: string; freshness: CacheFreshness }> {
  const staleTtlSec = opts.staleTtlSec ?? 300;

  const existing = inflight.get(opts.cacheKey);
  if (existing) {
    const envelope = (await existing) as CacheEnvelope<T>;
    const freshness = classifyFreshness(envelope.fetchedAt, opts.freshTtlSec, staleTtlSec) ?? 'origin';
    return { data: envelope.data, fetchedAt: envelope.fetchedAt, freshness };
  }

  const work = (async (): Promise<CacheEnvelope<T>> => {
    const cached = await readEnvelope<T>(opts.redis, opts.cacheKey);
    if (cached) {
      const freshness = classifyFreshness(cached.fetchedAt, opts.freshTtlSec, staleTtlSec);
      if (freshness) return cached;
    }
    return runDistributedSingleFlight(opts);
  })();

  inflight.set(opts.cacheKey, work as Promise<CacheEnvelope<unknown>>);
  try {
    const envelope = await work;
    const freshness = classifyFreshness(envelope.fetchedAt, opts.freshTtlSec, staleTtlSec) ?? 'origin';
    return { data: envelope.data, fetchedAt: envelope.fetchedAt, freshness };
  } finally {
    inflight.delete(opts.cacheKey);
  }
}

export async function getOrFetchJsonCache<T>(
  redis: Redis,
  cacheKey: string,
  freshTtlSec: number,
  log: FastifyBaseLogger,
  fetchData: () => Promise<T>,
  options?: Pick<GetOrFetchRedisCacheOptions<T>, 'staleTtlSec' | 'lockTtlSec' | 'waitMs' | 'resolveRedisTtlSec'>,
): Promise<{ data: T; fetchedAt: string; freshness: CacheFreshness }> {
  return getOrFetchRedisCache({
    redis,
    cacheKey,
    freshTtlSec,
    log,
    staleTtlSec: options?.staleTtlSec,
    lockTtlSec: options?.lockTtlSec,
    waitMs: options?.waitMs,
    resolveRedisTtlSec: options?.resolveRedisTtlSec,
    fetch: async () => ({
      fetchedAt: new Date().toISOString(),
      data: await fetchData(),
    }),
  });
}
