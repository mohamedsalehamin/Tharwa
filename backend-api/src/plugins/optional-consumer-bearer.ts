import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import type { Env } from '../config/env.js';
import { verifyConsumerAccessToken } from '../services/consumer-jwt.js';

/** Sets `request.consumer` when a valid Bearer token is present; otherwise leaves it unset. */
export function optionalConsumerBearerPreHandler(env: Env): preHandlerHookHandler {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const auth = request.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return;
    const raw = auth.slice('Bearer '.length).trim();
    if (!raw) return;
    const payload = await verifyConsumerAccessToken(env, raw);
    if (!payload) return;
    request.consumer = { id: payload.sub, email: payload.email };
  };
}
