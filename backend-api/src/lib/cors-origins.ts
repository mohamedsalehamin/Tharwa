import type { Env } from '../config/env.js';

/** Effective browser origins for @fastify/cors (explicit list + admin SPA origin). */
export function resolveCorsOrigins(env: Env): string[] {
  return [...new Set([...env.CORS_ORIGINS, env.ADMIN_PUBLIC_ORIGIN])];
}
