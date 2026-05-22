import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { AppCtx } from '../../app-context.js';
import { AppError, sendError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { consumerBearerPreHandler } from '../../plugins/consumer-bearer.js';
import {
  equityInstrumentRefBody,
  resolveEquityInstrumentId,
} from '../../services/equity-instrument-ref.js';

const addBody = equityInstrumentRefBody;

const reorderBody = z.object({
  orderedItemIds: z.array(z.string().uuid()).min(1),
});

function zodMessage(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
}

export const v1WatchlistRoutes: FastifyPluginAsync = async (app) => {
  const ctx = (): AppCtx => app.ctx;
  const guard = { preHandler: consumerBearerPreHandler(ctx().env) };

  app.get('/watchlist', { ...guard }, async (req, reply) => {
    try {
      const userId = req.consumer!.id;
      const rows = await prisma.watchlistItem.findMany({
        where: { consumerUserId: userId },
        orderBy: { position: 'asc' },
        include: {
          instrument: {
            select: { code: true, displayNameEn: true, kind: true, isConsumerVisible: true },
          },
        },
      });
      return reply.send({
        items: rows.map((r) => ({
          id: r.id,
          instrumentId: r.instrumentId,
          position: r.position,
          code: r.instrument.code,
          displayNameEn: r.instrument.displayNameEn,
          kind: r.instrument.kind,
          isConsumerVisible: r.instrument.isConsumerVisible,
        })),
      });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });

  app.post('/watchlist', { ...guard }, async (req, reply) => {
    try {
      const userId = req.consumer!.id;
      const parsed = addBody.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      }
      const instrumentId = await resolveEquityInstrumentId(parsed.data);
      if (!instrumentId) {
        throw new AppError('NOT_FOUND', 'Instrument not found', 404);
      }
      const maxPos = await prisma.watchlistItem.aggregate({
        where: { consumerUserId: userId },
        _max: { position: true },
      });
      const nextPos = (maxPos._max.position ?? -1) + 1;
      try {
        const row = await prisma.watchlistItem.create({
          data: {
            consumerUserId: userId,
            instrumentId,
            position: nextPos,
          },
          include: {
            instrument: { select: { code: true, displayNameEn: true, kind: true, isConsumerVisible: true } },
          },
        });
        return reply.status(201).send({
          item: {
            id: row.id,
            instrumentId: row.instrumentId,
            position: row.position,
            code: row.instrument.code,
            displayNameEn: row.instrument.displayNameEn,
            kind: row.instrument.kind,
            isConsumerVisible: row.instrument.isConsumerVisible,
          },
        });
      } catch (e: unknown) {
        if (
          typeof e === 'object' &&
          e !== null &&
          'code' in e &&
          (e as { code?: string }).code === 'P2002'
        ) {
          throw new AppError('CONFLICT', 'Instrument already on watchlist', 409);
        }
        throw e;
      }
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });

  app.delete('/watchlist/items/:id', { ...guard }, async (req, reply) => {
    try {
      const userId = req.consumer!.id;
      const { id } = req.params as { id: string };
      const row = await prisma.watchlistItem.findFirst({ where: { id, consumerUserId: userId } });
      if (!row) {
        throw new AppError('NOT_FOUND', 'Watchlist item not found', 404);
      }
      await prisma.watchlistItem.delete({ where: { id } });
      return reply.status(204).send();
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });

  app.patch('/watchlist/reorder', { ...guard }, async (req, reply) => {
    try {
      const userId = req.consumer!.id;
      const parsed = reorderBody.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      }
      const ids = parsed.data.orderedItemIds;
      const rows = await prisma.watchlistItem.findMany({
        where: { consumerUserId: userId },
        select: { id: true },
      });
      const have = new Set(rows.map((r) => r.id));
      if (rows.length !== ids.length || ids.some((id) => !have.has(id))) {
        throw new AppError('VALIDATION', 'orderedItemIds must list every watchlist item exactly once', 400);
      }
      await prisma.$transaction(
        ids.map((id, index) =>
          prisma.watchlistItem.update({
            where: { id },
            data: { position: index },
          }),
        ),
      );
      const out = await prisma.watchlistItem.findMany({
        where: { consumerUserId: userId },
        orderBy: { position: 'asc' },
        include: {
          instrument: { select: { code: true, displayNameEn: true, kind: true, isConsumerVisible: true } },
        },
      });
      return reply.send({
        items: out.map((r) => ({
          id: r.id,
          instrumentId: r.instrumentId,
          position: r.position,
          code: r.instrument.code,
          displayNameEn: r.instrument.displayNameEn,
          kind: r.instrument.kind,
          isConsumerVisible: r.instrument.isConsumerVisible,
        })),
      });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });
};
