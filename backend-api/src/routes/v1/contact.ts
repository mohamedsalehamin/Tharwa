import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { AppCtx } from '../../app-context.js';
import { clientIp } from '../../lib/client-ip.js';
import { AppError, sendError } from '../../lib/errors.js';
import { allowAuthRateLimit } from '../../plugins/auth-rate-limit.js';
import { optionalConsumerBearerPreHandler } from '../../plugins/optional-consumer-bearer.js';
import { createContactSubmission } from '../../services/contact-submissions.js';

const contactBody = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  subject: z.string().trim().max(200).optional(),
  message: z.string().trim().min(1).max(5000),
});

function zodMessage(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
}

export const v1ContactRoutes: FastifyPluginAsync = async (app) => {
  const ctx = (): AppCtx => app.ctx;
  const optionalAuth = { preHandler: optionalConsumerBearerPreHandler(ctx().env) };

  app.post('/contact', { ...optionalAuth }, async (req, reply) => {
    try {
      const ip = clientIp(req);
      if (!allowAuthRateLimit(`contact:${ip}`, 10)) {
        throw new AppError('RATE_LIMIT', 'Too many requests', 429);
      }
      const parsed = contactBody.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      }
      const subject = parsed.data.subject?.trim();
      const item = await createContactSubmission({
        name: parsed.data.name,
        email: parsed.data.email.toLowerCase(),
        subject: subject && subject.length > 0 ? subject : null,
        message: parsed.data.message,
        consumerUserId: req.consumer?.id ?? null,
        ip,
      });
      return reply.status(201).send({ id: item.id });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });
};
