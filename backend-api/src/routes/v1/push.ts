import type { FastifyPluginAsync } from 'fastify';
import { PushPlatform } from '@prisma/client';
import { z } from 'zod';
import type { AppCtx } from '../../app-context.js';
import { AppError, sendError } from '../../lib/errors.js';
import { optionalConsumerBearerPreHandler } from '../../plugins/optional-consumer-bearer.js';
import { disablePushDevice, upsertPushDevice } from '../../services/push-devices.js';

const registerBody = z.object({
  token: z.string().min(20).max(4096),
  platform: z.enum(['ios', 'android']),
  installId: z.string().min(8).max(128).optional(),
  locale: z.enum(['ar', 'en']).optional(),
});

const unregisterBody = z.object({
  token: z.string().min(20).max(4096),
});

function zodMessage(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
}

export const v1PushRoutes: FastifyPluginAsync = async (app) => {
  const ctx = (): AppCtx => app.ctx;
  const optionalAuth = { preHandler: optionalConsumerBearerPreHandler(ctx().env) };

  app.put('/push/register', { ...optionalAuth }, async (req, reply) => {
    try {
      const parsed = registerBody.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      }
      await upsertPushDevice({
        fcmToken: parsed.data.token.trim(),
        platform: parsed.data.platform as PushPlatform,
        installId: parsed.data.installId ?? null,
        consumerUserId: req.consumer?.id ?? null,
        locale: parsed.data.locale ?? null,
      });
      return reply.status(204).send();
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.delete('/push/register', async (req, reply) => {
    try {
      const parsed = unregisterBody.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      }
      await disablePushDevice(parsed.data.token.trim());
      return reply.status(204).send();
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });
};
