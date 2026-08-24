import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import type { Env } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import { bindSentryConsumerUser } from '../observability/sentry.js';
import { verifyConsumerAccessToken } from '../services/consumer-jwt.js';
import { getConsumerUserPublic } from '../services/consumer-user.js';

export function consumerBearerPreHandler(env: Env): preHandlerHookHandler {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const auth = request.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      throw new AppError('UNAUTHORIZED', 'Missing bearer token', 401);
    }
    const raw = auth.slice('Bearer '.length).trim();
    if (!raw) {
      throw new AppError('UNAUTHORIZED', 'Missing bearer token', 401);
    }
    const payload = await verifyConsumerAccessToken(env, raw);
    if (!payload) {
      throw new AppError('UNAUTHORIZED', 'Invalid or expired token', 401);
    }
    const user = await getConsumerUserPublic(payload.sub);
    if (!user) {
      throw new AppError('UNAUTHORIZED', 'Invalid or expired token', 401);
    }
    request.consumer = { id: user.id, email: user.email };
    bindSentryConsumerUser(user.id);
  };
}
