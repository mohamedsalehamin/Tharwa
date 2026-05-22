import type { FastifyPluginAsync } from 'fastify';
import type { Env } from '../config/env.js';
import { clientIp } from '../lib/client-ip.js';
import { AppError, sendError } from '../lib/errors.js';
import { isPublicMarketReadPath } from '../lib/public-routes.js';
import { allowSlidingWindow } from '../lib/sliding-window-rate-limit.js';

/** GET paths that fan out to upstream market connectors (per-IP limit). */
export function isPublicMarketRateLimitedPath(method: string, url: string): boolean {
  return isPublicMarketReadPath(method, url);
}

export function allowPublicMarketRateLimit(ip: string, maxPerMinute: number): boolean {
  return allowSlidingWindow(`public-market:${ip}`, maxPerMinute);
}

export const publicMarketRateLimitPlugin: FastifyPluginAsync<{ env: Env }> = async (app, opts) => {
  const maxPerMinute = opts.env.PUBLIC_RATE_LIMIT_MAX_PER_MINUTE;

  app.addHook('onRequest', async (req, reply) => {
    if (!isPublicMarketRateLimitedPath(req.method, req.url)) return;
    const ip = clientIp(req);
    if (allowPublicMarketRateLimit(ip, maxPerMinute)) return;
    reply.header('Retry-After', '60');
    sendError(reply, new AppError('RATE_LIMIT', 'Too many requests', 429));
  });
};
