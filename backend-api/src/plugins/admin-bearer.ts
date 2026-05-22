import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import type { Env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { verifyAdminAccessToken } from '../services/admin-jwt.js';
import { AppError } from '../lib/errors.js';
import { isAdminRole } from './admin-role.js';

export function adminBearerPreHandler(env: Env): preHandlerHookHandler {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const auth = request.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      throw new AppError('UNAUTHORIZED', 'Missing bearer token', 401);
    }
    const raw = auth.slice('Bearer '.length).trim();
    if (!raw) {
      throw new AppError('UNAUTHORIZED', 'Missing bearer token', 401);
    }
    const payload = await verifyAdminAccessToken(env, raw);
    if (!payload) {
      throw new AppError('UNAUTHORIZED', 'Invalid or expired token', 401);
    }
    const user = await prisma.adminUser.findUnique({ where: { id: payload.sub } });
    if (!user) {
      throw new AppError('UNAUTHORIZED', 'Admin user not found', 401);
    }
    if (!isAdminRole(user.role)) {
      throw new AppError('FORBIDDEN', 'Invalid admin role', 403);
    }
    request.admin = { id: user.id, email: user.email, role: user.role };
  };
}
