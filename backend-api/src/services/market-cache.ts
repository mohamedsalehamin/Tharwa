import type { Redis } from 'ioredis';

export type MarketCacheScope = 'fx' | 'metals' | 'equities' | 'all';

const SCOPE_KEYS: Record<Exclude<MarketCacheScope, 'all'>, string[]> = {
  fx: ['cache:fx:v1'],
  metals: ['cache:metals:v1'],
  equities: [
    'cache:eq:v1:curated:list',
    'cache:eq:v1:curated:list:v3',
    'cache:eq:v1:market:egx:v2',
  ],
};

/** Delete hot Redis keys so the next request refetches upstream data. */
export async function invalidateMarketCaches(
  redis: Redis,
  scopes: MarketCacheScope[],
): Promise<{ deletedKeys: string[] }> {
  const keySet = new Set<string>();
  for (const scope of scopes) {
    if (scope === 'all') {
      for (const keys of Object.values(SCOPE_KEYS)) {
        for (const k of keys) keySet.add(k);
      }
    } else {
      for (const k of SCOPE_KEYS[scope]) keySet.add(k);
    }
  }
  const deletedKeys = [...keySet];
  await Promise.all(deletedKeys.map((k) => redis.del(k))).catch(() => undefined);
  return { deletedKeys };
}
