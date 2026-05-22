import type { FastifyPluginAsync } from 'fastify';
import { metricsContentType, renderMetrics } from '../lib/metrics.js';

export const metricsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/metrics', async (_req, reply) => {
    const body = await renderMetrics();
    return reply.header('Content-Type', metricsContentType()).send(body);
  });
};
