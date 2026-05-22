import RedisMock from 'ioredis-mock';
import type { Redis } from 'ioredis';
import { buildApp } from '../../src/app.js';
import type { AppCtx } from '../../src/app-context.js';
import type { Env } from '../../src/config/env.js';
import { createTestEnv } from './test-env.js';

export async function buildTestApp(envOverrides: Partial<NodeJS.ProcessEnv> = {}) {
  const env = createTestEnv(envOverrides);
  const redis = new RedisMock() as unknown as Redis;
  const ctx: AppCtx = { env, redis };
  const app = await buildApp(env, ctx);
  await app.ready();
  return { app, env, redis, async close() {
    await app.close();
  } };
}
