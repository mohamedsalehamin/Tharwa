import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { AppCtx } from '../../app-context.js';
import { AppError, sendError } from '../../lib/errors.js';
import { optionalConsumerBearerPreHandler } from '../../plugins/optional-consumer-bearer.js';
import { normalizeBriefLocale } from '../../services/brief-locale.js';
import { listConsumerNotifications } from '../../services/consumer-notifications.js';

const listQuery = z.object({
  installId: z.string().min(8).max(128),
  locale: z.enum(['ar', 'en']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

function zodMessage(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
}

export const v1NotificationsRoutes: FastifyPluginAsync = async (app) => {
  const ctx = (): AppCtx => app.ctx;
  const optionalAuth = { preHandler: optionalConsumerBearerPreHandler(ctx().env) };

  app.get('/notifications', { ...optionalAuth }, async (req, reply) => {
    try {
      const parsed = listQuery.safeParse(req.query);
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      }
      const locale = normalizeBriefLocale(parsed.data.locale);
      const result = await listConsumerNotifications({
        installId: parsed.data.installId.trim(),
        locale,
        consumerUserId: req.consumer?.id ?? null,
        limit: parsed.data.limit,
      });
      return reply.send(result);
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });
};
