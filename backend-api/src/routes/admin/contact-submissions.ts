import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { AppCtx } from '../../app-context.js';
import { AppError, sendError } from '../../lib/errors.js';
import { adminBearerPreHandler } from '../../plugins/admin-bearer.js';
import { listContactSubmissionsAdmin } from '../../services/contact-submissions.js';

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  email: z.string().max(254).optional(),
});

function zodMessage(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
}

export const adminContactSubmissionsRoutes: FastifyPluginAsync = async (app) => {
  const ctx = (): AppCtx => app.ctx;
  const guard = { preHandler: adminBearerPreHandler(ctx().env) };

  app.get('/contact-submissions', { ...guard }, async (req, reply) => {
    try {
      const parsed = listQuery.safeParse(req.query);
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      }
      const result = await listContactSubmissionsAdmin({
        limit: parsed.data.limit,
        offset: parsed.data.offset,
        email: parsed.data.email,
      });
      return reply.send(result);
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });
};
