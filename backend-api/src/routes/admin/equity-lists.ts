import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { EquityListKind } from '@prisma/client';
import type { AppCtx } from '../../app-context.js';
import { AppError, sendError } from '../../lib/errors.js';
import { adminBearerPreHandler } from '../../plugins/admin-bearer.js';
import { writeAdminAudit } from '../../services/admin-audit.js';
import {
  createEquityList,
  deleteEquityList,
  importSectorMembersFromTradingView,
  invalidateEquityListCaches,
  listEquityListsAdmin,
  removeEquityListMember,
  setEquityListMembers,
  updateEquityList,
} from '../../services/equity-lists.js';

const shortText = z.string().min(1).max(200);
const codeText = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z][a-z0-9_]*$/, 'code must be lowercase snake_case');

const listBody = z.object({
  code: codeText,
  titleAr: shortText,
  titleEn: shortText,
  descriptionAr: z.string().max(2000).optional().nullable(),
  descriptionEn: z.string().max(2000).optional().nullable(),
  kind: z.nativeEnum(EquityListKind),
  sortOrder: z.number().int().min(-1000).max(1000).optional(),
  isPublished: z.boolean().optional(),
  tvAliases: z.array(z.string().min(1).max(120)).max(30).optional().nullable(),
});

const membersBody = z.object({
  symbols: z.array(z.string().min(1).max(20)).min(1).max(200),
});

function zodMessage(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
}

function clientIp(req: { ip: string }): string {
  return req.ip;
}

export const adminEquityListsRoutes: FastifyPluginAsync = async (app) => {
  const ctx = (): AppCtx => app.ctx;
  const guard = { preHandler: adminBearerPreHandler(ctx().env) };

  app.get('/equity-lists', { ...guard }, async (_req, reply) => {
    const items = await listEquityListsAdmin();
    return reply.send({ items });
  });

  app.post('/equity-lists', { ...guard }, async (req, reply) => {
    try {
      const parsed = listBody.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      }
      const item = await createEquityList(parsed.data);
      await invalidateEquityListCaches(ctx().redis);
      await writeAdminAudit(
        req.admin!.id,
        'admin.equity_lists.create',
        { id: item.id, code: item.code },
        clientIp(req),
      );
      return reply.status(201).send({ item });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });

  app.patch('/equity-lists/:id', { ...guard }, async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const parsed = listBody.partial().safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      }
      const item = await updateEquityList(id, parsed.data);
      if (!item) {
        throw new AppError('NOT_FOUND', 'List not found', 404);
      }
      await invalidateEquityListCaches(ctx().redis);
      await writeAdminAudit(req.admin!.id, 'admin.equity_lists.update', { id }, clientIp(req));
      return reply.send({ item });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });

  app.delete('/equity-lists/:id', { ...guard }, async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const ok = await deleteEquityList(id);
      if (!ok) {
        throw new AppError('NOT_FOUND', 'List not found', 404);
      }
      await invalidateEquityListCaches(ctx().redis);
      await writeAdminAudit(req.admin!.id, 'admin.equity_lists.delete', { id }, clientIp(req));
      return reply.send({ ok: true });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });

  app.post('/equity-lists/:id/members', { ...guard }, async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const parsed = membersBody.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      }
      const added = await setEquityListMembers(id, parsed.data.symbols);
      await invalidateEquityListCaches(ctx().redis);
      await writeAdminAudit(
        req.admin!.id,
        'admin.equity_lists.members.add',
        { id, count: added },
        clientIp(req),
      );
      return reply.send({ added });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });

  app.delete('/equity-lists/:id/members/:symbol', { ...guard }, async (req, reply) => {
    try {
      const { id, symbol } = req.params as { id: string; symbol: string };
      const ok = await removeEquityListMember(id, symbol);
      if (!ok) {
        throw new AppError('NOT_FOUND', 'Member not found', 404);
      }
      await invalidateEquityListCaches(ctx().redis);
      await writeAdminAudit(
        req.admin!.id,
        'admin.equity_lists.members.remove',
        { id, symbol },
        clientIp(req),
      );
      return reply.send({ ok: true });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });

  app.post('/equity-lists/import-sectors', { ...guard }, async (req, reply) => {
    try {
      const result = await importSectorMembersFromTradingView(app.log);
      await invalidateEquityListCaches(ctx().redis);
      await writeAdminAudit(
        req.admin!.id,
        'admin.equity_lists.import_sectors',
        result,
        clientIp(req),
      );
      return reply.send(result);
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });
};
