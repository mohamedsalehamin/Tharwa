import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

export async function writeAdminAudit(
  adminUserId: string,
  action: string,
  payload?: Prisma.InputJsonValue,
  ip?: string | null,
): Promise<void> {
  await prisma.adminAuditLog.create({
    data: {
      adminUserId,
      action,
      payload: payload === undefined ? undefined : payload,
      ip: ip ?? undefined,
    },
  });
}
