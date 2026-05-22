import type { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import type { AppCtx } from '../../app-context.js';
import { AppError, sendError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { consumerBearerPreHandler } from '../../plugins/consumer-bearer.js';
import { resolveEquityInstrumentId } from '../../services/equity-instrument-ref.js';
import {
  assertJournalSellAllowed,
  journalCreateBody,
  journalPatchBody,
  zodJournalMessage,
} from '../../services/journal-validation.js';

export const v1JournalRoutes: FastifyPluginAsync = async (app) => {
  const ctx = (): AppCtx => app.ctx;
  const guard = { preHandler: consumerBearerPreHandler(ctx().env) };

  app.get('/journal', { ...guard }, async (req, reply) => {
    try {
      const userId = req.consumer!.id;
      const rows = await prisma.tradeJournalEntry.findMany({
        where: { consumerUserId: userId },
        orderBy: [{ executedAt: 'desc' }, { createdAt: 'desc' }],
        include: { instrument: { select: { code: true, displayNameEn: true } } },
      });
      return reply.send({
        items: rows.map((r) => ({
          id: r.id,
          instrumentId: r.instrumentId,
          code: r.instrument.code,
          displayNameEn: r.instrument.displayNameEn,
          side: r.side,
          quantity: r.quantity.toString(),
          price: r.price.toString(),
          executedAt: r.executedAt.toISOString().slice(0, 10),
          note: r.note,
          createdAt: r.createdAt.toISOString(),
        })),
      });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });

  app.post('/journal', { ...guard }, async (req, reply) => {
    try {
      const userId = req.consumer!.id;
      const parsed = journalCreateBody.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodJournalMessage(parsed.error), 400);
      }
      const b = parsed.data;
      const instrumentId = await resolveEquityInstrumentId(b);
      if (!instrumentId) {
        throw new AppError('NOT_FOUND', 'Instrument not found', 404);
      }
      if (b.side === 'sell') {
        await assertJournalSellAllowed(userId, instrumentId, b.quantity);
      }
      const row = await prisma.tradeJournalEntry.create({
        data: {
          consumerUserId: userId,
          instrumentId,
          side: b.side,
          quantity: new Prisma.Decimal(String(b.quantity)),
          price: new Prisma.Decimal(String(b.price)),
          executedAt: b.executedAt,
          note: b.note ?? undefined,
        },
        include: { instrument: { select: { code: true, displayNameEn: true } } },
      });
      return reply.status(201).send({
        item: {
          id: row.id,
          instrumentId: row.instrumentId,
          code: row.instrument.code,
          displayNameEn: row.instrument.displayNameEn,
          side: row.side,
          quantity: row.quantity.toString(),
          price: row.price.toString(),
          executedAt: row.executedAt.toISOString().slice(0, 10),
          note: row.note,
          createdAt: row.createdAt.toISOString(),
        },
      });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });

  app.patch('/journal/:id', { ...guard }, async (req, reply) => {
    try {
      const userId = req.consumer!.id;
      const { id } = req.params as { id: string };
      const parsed = journalPatchBody.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodJournalMessage(parsed.error), 400);
      }
      const existing = await prisma.tradeJournalEntry.findFirst({
        where: { id, consumerUserId: userId },
      });
      if (!existing) {
        throw new AppError('NOT_FOUND', 'Journal entry not found', 404);
      }
      const data: Prisma.TradeJournalEntryUpdateInput = {};
      const b = parsed.data;
      if (b.note !== undefined) data.note = b.note;
      if (b.price !== undefined) data.price = new Prisma.Decimal(String(b.price));
      if (b.executedAt !== undefined) data.executedAt = b.executedAt;
      const row = await prisma.tradeJournalEntry.update({
        where: { id },
        data,
        include: { instrument: { select: { code: true, displayNameEn: true } } },
      });
      return reply.send({
        item: {
          id: row.id,
          instrumentId: row.instrumentId,
          code: row.instrument.code,
          displayNameEn: row.instrument.displayNameEn,
          side: row.side,
          quantity: row.quantity.toString(),
          price: row.price.toString(),
          executedAt: row.executedAt.toISOString().slice(0, 10),
          note: row.note,
          createdAt: row.createdAt.toISOString(),
        },
      });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });

  app.delete('/journal/:id', { ...guard }, async (req, reply) => {
    try {
      const userId = req.consumer!.id;
      const { id } = req.params as { id: string };
      const row = await prisma.tradeJournalEntry.findFirst({ where: { id, consumerUserId: userId } });
      if (!row) {
        throw new AppError('NOT_FOUND', 'Journal entry not found', 404);
      }
      await prisma.tradeJournalEntry.delete({ where: { id } });
      return reply.status(204).send();
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });
};
