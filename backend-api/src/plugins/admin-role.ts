import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import { AppError } from '../lib/errors.js';

export const ADMIN_ROLES = ['superadmin', 'operator'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export function isAdminRole(value: string): value is AdminRole {
  return (ADMIN_ROLES as readonly string[]).includes(value);
}

/** Require an authenticated admin with one of the given roles (run after adminBearerPreHandler). */
export function requireAdminRoles(...roles: AdminRole[]): preHandlerHookHandler {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const admin = request.admin;
    if (!admin) {
      throw new AppError('UNAUTHORIZED', 'Missing admin context', 401);
    }
    if (!isAdminRole(admin.role) || !roles.includes(admin.role)) {
      throw new AppError('FORBIDDEN', 'Insufficient permissions', 403);
    }
  };
}

export const requireSuperadmin = requireAdminRoles('superadmin');
