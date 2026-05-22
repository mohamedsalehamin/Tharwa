import type { FastifyPluginAsync } from 'fastify';
import { PriceAlertDirection } from '@prisma/client';
import { z } from 'zod';
import type { AppCtx } from '../../app-context.js';
import { AppError, sendError } from '../../lib/errors.js';
import { consumerBearerPreHandler } from '../../plugins/consumer-bearer.js';
import {
  createPriceAlert,
  deletePriceAlert,
  listPriceAlertsForUser,
  updatePriceAlert,
} from '../../services/price-alerts.js';

const createBody = z.object({
  instrumentId: z.string().uuid(),
  direction: z.enum(['above', 'below']),
  threshold: z.coerce.number().positive(),
});

const patchBody = z.object({
  direction: z.enum(['above', 'below']).optional(),
  threshold: z.coerce.number().positive().optional(),
  isEnabled: z.boolean().optional(),
});

function zodMessage(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
}

function mapAlert(row: Awaited<ReturnType<typeof listPriceAlertsForUser>>[number]) {
  return {
    id: row.id,
    instrumentId: row.instrumentId,
    instrument: row.instrument,
    direction: row.direction,
    threshold: Number(row.threshold),
    isEnabled: row.isEnabled,
    lastTriggeredAt: row.lastTriggeredAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const v1PriceAlertsRoutes: FastifyPluginAsync = async (app) => {
  const ctx = (): AppCtx => app.ctx;
  const guard = { preHandler: consumerBearerPreHandler(ctx().env) };

  app.get('/alerts', { ...guard }, async (req, reply) => {
    try {
      const rows = await listPriceAlertsForUser(req.consumer!.id);
      return reply.send({ items: rows.map(mapAlert) });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.post('/alerts', { ...guard }, async (req, reply) => {
    try {
      const parsed = createBody.safeParse(req.body);
      if (!parsed.success) throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      const row = await createPriceAlert(req.consumer!.id, {
        instrumentId: parsed.data.instrumentId,
        direction: parsed.data.direction as PriceAlertDirection,
        threshold: parsed.data.threshold,
      });
      return reply.status(201).send({ item: mapAlert(row) });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.patch('/alerts/:id', { ...guard }, async (req, reply) => {
    try {
      const parsed = patchBody.safeParse(req.body);
      if (!parsed.success) throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      const { id } = req.params as { id: string };
      const row = await updatePriceAlert(req.consumer!.id, id, {
        ...(parsed.data.direction !== undefined
          ? { direction: parsed.data.direction as PriceAlertDirection }
          : {}),
        ...(parsed.data.threshold !== undefined ? { threshold: parsed.data.threshold } : {}),
        ...(parsed.data.isEnabled !== undefined ? { isEnabled: parsed.data.isEnabled } : {}),
      });
      if (!row) throw new AppError('NOT_FOUND', 'Alert not found', 404);
      return reply.send({ item: mapAlert(row) });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.delete('/alerts/:id', { ...guard }, async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const ok = await deletePriceAlert(req.consumer!.id, id);
      if (!ok) throw new AppError('NOT_FOUND', 'Alert not found', 404);
      return reply.status(204).send();
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });
};
