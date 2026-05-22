import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { AppCtx } from '../../app-context.js';
import { AppError, sendError } from '../../lib/errors.js';
import { adminBearerPreHandler } from '../../plugins/admin-bearer.js';
import { requireSuperadmin } from '../../plugins/admin-role.js';
import { writeAdminAudit } from '../../services/admin-audit.js';
import {
  clearFcmServiceAccount,
  listIntegrations,
  upsertFcmServiceAccount,
} from '../../services/platform-integrations.js';

const fcmUploadBody = z.object({
  serviceAccount: z.union([z.record(z.string(), z.unknown()), z.string()]),
});

function zodMessage(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
}

function clientIp(req: { ip?: string; headers: Record<string, unknown> }): string | undefined {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length > 0) return xf.split(',')[0]?.trim();
  return req.ip;
}

export const adminSettingsRoutes: FastifyPluginAsync = async (app) => {
  const ctx = (): AppCtx => app.ctx;
  const guard = { preHandler: adminBearerPreHandler(ctx().env) };
  const superadminGuard = {
    preHandler: [adminBearerPreHandler(ctx().env), requireSuperadmin],
  };

  app.get('/settings/integrations', { ...guard }, async (_req, reply) => {
    try {
      const items = await listIntegrations(ctx().env);
      return reply.send({ items });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.put('/settings/integrations/fcm', { ...superadminGuard }, async (req, reply) => {
    try {
      const admin = req.admin!;
      const parsed = fcmUploadBody.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      }
      const publicInfo = await upsertFcmServiceAccount(admin.id, parsed.data.serviceAccount);
      await writeAdminAudit(
        admin.id,
        'admin.integrations.fcm.upload',
        { projectId: publicInfo.projectId, clientEmail: publicInfo.clientEmail },
        clientIp(req),
      );
      const items = await listIntegrations(ctx().env);
      return reply.send({ fcm: publicInfo, items });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.delete('/settings/integrations/fcm', { ...superadminGuard }, async (req, reply) => {
    try {
      const admin = req.admin!;
      await clearFcmServiceAccount();
      await writeAdminAudit(admin.id, 'admin.integrations.fcm.clear', {}, clientIp(req));
      const items = await listIntegrations(ctx().env);
      return reply.send({ items });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });
};
