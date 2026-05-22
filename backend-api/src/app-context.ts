import type { Env } from './config/env.js';
import type { Redis } from 'ioredis';

export type AppCtx = { env: Env; redis: Redis };

declare module 'fastify' {
  interface FastifyInstance {
    ctx: AppCtx;
  }

  interface FastifyRequest {
    admin?: { id: string; email: string; role: string };
    consumer?: { id: string; email: string };
    observabilityStart?: bigint;
  }
}
