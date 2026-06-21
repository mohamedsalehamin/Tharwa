import type { FastifyPluginAsync } from 'fastify';
import { resolveCorsOrigins } from '../lib/cors-origins.js';
import { prisma } from '../lib/prisma.js';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async (_req, reply) => {
    const checks: Record<string, 'ok' | 'fail'> = {
      postgres: 'fail',
      redis: 'fail',
    };
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.postgres = 'ok';
    } catch {
      checks.postgres = 'fail';
    }
    try {
      await app.ctx.redis.ping();
      checks.redis = 'ok';
    } catch {
      checks.redis = 'fail';
    }
    const status = checks.postgres === 'ok' && checks.redis === 'ok' ? 'ok' : 'degraded';
    const code = status === 'ok' ? 200 : 503;
    return reply.status(code).send({
      status,
      checks,
      service: app.ctx.env.SERVICE_NAME,
      build: app.ctx.env.BUILD_SHA,
      corsOrigins: resolveCorsOrigins(app.ctx.env).length,
    });
  });
};
