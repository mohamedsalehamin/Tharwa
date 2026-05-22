import type { FastifyPluginAsync } from 'fastify';
import type { Env } from '../config/env.js';
import { isPublicMarketReadPath } from '../lib/public-routes.js';

export function publicCacheControlHeader(env: Env): string {
  const maxAge = env.PUBLIC_HTTP_MAX_AGE_SEC;
  const sMaxAge = env.PUBLIC_HTTP_S_MAXAGE_SEC;
  const swr = env.PUBLIC_HTTP_STALE_WHILE_REVALIDATE_SEC;
  return `public, max-age=${maxAge}, s-maxage=${sMaxAge}, stale-while-revalidate=${swr}`;
}

export const publicHttpCachePlugin: FastifyPluginAsync<{ env: Env }> = async (app, opts) => {
  app.addHook('onSend', async (req, reply, payload) => {
    if (!isPublicMarketReadPath(req.method, req.url)) return payload;
    if (reply.statusCode >= 400) return payload;
    reply.header('Cache-Control', publicCacheControlHeader(opts.env));
    return payload;
  });
};
