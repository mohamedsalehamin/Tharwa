import { Redis } from 'ioredis';
import type { Logger } from 'pino';

let client: Redis | null = null;

export function getRedis(url: string, log: Logger): Redis {
  if (!client) {
    client = new Redis(url, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
    client.on('error', (err: Error) => {
      log.error({ err }, 'redis error');
    });
  }
  return client;
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}
