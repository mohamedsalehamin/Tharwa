import type { FastifyPluginAsync } from 'fastify';
import cors from '@fastify/cors';

export type CorsPluginOpts = {
  origins: string[];
  /** When true, also allow http(s) origins whose host is RFC1918 (e.g. http://192.168.x.x:3001). Only for local development. */
  allowPrivateLanInDev: boolean;
};

function isPrivateLanHttpOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const host = u.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return true;
    const parts = host.split('.').map((p) => Number(p));
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false;
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    return false;
  } catch {
    return false;
  }
}

export const corsPlugin: FastifyPluginAsync<CorsPluginOpts> = async (app, opts) => {
  const allowList = new Set(opts.origins);

  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowList.has(origin)) {
        callback(null, true);
        return;
      }
      if (opts.allowPrivateLanInDev && isPrivateLanHttpOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
  });
};
