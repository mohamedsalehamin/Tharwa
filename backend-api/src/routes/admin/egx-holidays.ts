import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { AppCtx } from '../../app-context.js';
import { AppError, sendError } from '../../lib/errors.js';
import { adminBearerPreHandler } from '../../plugins/admin-bearer.js';
import { writeAdminAudit } from '../../services/admin-audit.js';
import {
  cairoCalendarYear,
  createAdminEgxHoliday,
  deleteEgxHoliday,
  getLatestEgxHolidaySyncRun,
  listEgxHolidaysAdmin,
  parseHolidayDateKey,
  syncEgxHolidaysFromCalendarLabs,
} from '../../services/egx-holidays.js';

const createBody = z.object({
  holidayDate: z.string().min(10).max(10),
  nameEn: z.string().min(1).max(200),
  nameAr: z.string().max(200).optional().nullable(),
});

const syncBody = z.object({
  years: z.array(z.coerce.number().int().min(2000).max(2100)).min(1).max(5).optional(),
});

const listQuery = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});

function zodMessage(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
}

function clientIp(req: { ip?: string; headers: Record<string, unknown> }): string | undefined {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length > 0) return xf.split(',')[0]?.trim();
  return req.ip;
}

export const adminEgxHolidaysRoutes: FastifyPluginAsync = async (app) => {
  const ctx = (): AppCtx => app.ctx;
  const guard = { preHandler: adminBearerPreHandler(ctx().env) };

  app.get('/egx-holidays', { ...guard }, async (req, reply) => {
    try {
      const parsed = listQuery.safeParse(req.query);
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      }
      const [items, lastSync] = await Promise.all([
        listEgxHolidaysAdmin({ year: parsed.data.year }),
        getLatestEgxHolidaySyncRun(),
      ]);
      return reply.send({
        items,
        lastSync,
        defaultSyncYears: [cairoCalendarYear(), cairoCalendarYear() + 1],
      });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.post('/egx-holidays', { ...guard }, async (req, reply) => {
    try {
      const parsed = createBody.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      }
      try {
        parseHolidayDateKey(parsed.data.holidayDate);
      } catch {
        throw new AppError('VALIDATION', 'holidayDate must be YYYY-MM-DD', 400);
      }

      let item;
      try {
        item = await createAdminEgxHoliday({
          holidayDate: parsed.data.holidayDate,
          nameEn: parsed.data.nameEn.trim(),
          nameAr: parsed.data.nameAr?.trim() || null,
          createdByAdminId: req.admin!.id,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('already exists')) {
          throw new AppError('CONFLICT', msg, 409);
        }
        throw e;
      }

      await writeAdminAudit(
        req.admin!.id,
        'admin.egx_holidays.create',
        { id: item.id, holidayDate: item.holidayDate, nameEn: item.nameEn },
        clientIp(req),
      );
      return reply.status(201).send({ item });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.delete('/egx-holidays/:id', { ...guard }, async (req, reply) => {
    try {
      const id = (req.params as { id: string }).id;
      const ok = await deleteEgxHoliday(id);
      if (!ok) {
        throw new AppError('NOT_FOUND', 'Holiday not found', 404);
      }
      await writeAdminAudit(
        req.admin!.id,
        'admin.egx_holidays.delete',
        { id },
        clientIp(req),
      );
      return reply.status(204).send();
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.post('/egx-holidays/sync', { ...guard }, async (req, reply) => {
    try {
      const parsed = syncBody.safeParse(req.body ?? {});
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      }

      const result = await syncEgxHolidaysFromCalendarLabs(parsed.data.years);
      await writeAdminAudit(
        req.admin!.id,
        'admin.egx_holidays.sync',
        { years: result.years, holidaysUpserted: result.holidaysUpserted },
        clientIp(req),
      );
      const [items, lastSync] = await Promise.all([
        listEgxHolidaysAdmin(),
        getLatestEgxHolidaySyncRun(),
      ]);
      return reply.send({
        result,
        items,
        lastSync,
        defaultSyncYears: [cairoCalendarYear(), cairoCalendarYear() + 1],
      });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });
};
