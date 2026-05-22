import type { Redis } from 'ioredis';

/**
 * Renew-or-acquire a short-lived leader lock (one winner per key across replicas).
 * Holders must call each tick before work; TTL allows failover if the leader dies.
 */
export async function withRedisLeader(
  redis: Redis,
  lockKey: string,
  holderId: string,
  ttlSec: number,
): Promise<boolean> {
  const acquired = await redis.set(lockKey, holderId, 'EX', ttlSec, 'NX');
  if (acquired === 'OK') return true;

  const current = await redis.get(lockKey);
  if (current === holderId) {
    await redis.expire(lockKey, ttlSec);
    return true;
  }
  return false;
}
