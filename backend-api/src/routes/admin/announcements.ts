import type { FastifyPluginAsync } from 'fastify';
import { AnnouncementVariant } from '@prisma/client';
import { z } from 'zod';
import type { AppCtx } from '../../app-context.js';
import { AppError, sendError } from '../../lib/errors.js';
import { adminBearerPreHandler } from '../../plugins/admin-bearer.js';
import { writeAdminAudit } from '../../services/admin-audit.js';
import {
  createAnnouncement,
  deleteAnnouncement,
  listAllAnnouncementsAdmin,
  parseOptionalDate,
  updateAnnouncement,
} from '../../services/announcements.js';

const variantEnum = z.enum(['info', 'warning', 'maintenance']);

const announcementBody = z.object({
  titleAr: z.string().min(1).max(200),
  titleEn: z.string().min(1).max(200),
  bodyAr: z.string().min(1).max(2000),
  bodyEn: z.string().min(1).max(2000),
  variant: variantEnum.optional(),
  sortOrder: z.number().int().min(-1000).max(1000).optional(),
  isEnabled: z.boolean().optional(),
  dismissible: z.boolean().optional(),
  linkUrl: z.union([z.string().url().max(500), z.literal(''), z.null()]).optional(),
  startsAt: z.union([z.string().min(1).max(40), z.literal(''), z.null()]).optional(),
  endsAt: z.union([z.string().min(1).max(40), z.literal(''), z.null()]).optional(),
});

const patchAnnouncementBody = announcementBody.partial().refine(
  (b) => Object.values(b).some((v) => v !== undefined),
  { message: 'At least one field is required' },
);

function zodMessage(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
}

function clientIp(req: { ip?: string; headers: Record<string, unknown> }): string | undefined {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length > 0) return xf.split(',')[0]?.trim();
  return req.ip;
}

function normalizeLinkUrl(raw: string | null | undefined): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  return raw;
}

function bodyToScheduleFields(body: {
  startsAt?: string | null;
  endsAt?: string | null;
}) {
  let startsAt: Date | null | undefined;
  let endsAt: Date | null | undefined;
  try {
    if (body.startsAt !== undefined) {
      startsAt = parseOptionalDate(
        body.startsAt === '' ? null : body.startsAt,
        'startsAt',
      );
    }
    if (body.endsAt !== undefined) {
      endsAt = parseOptionalDate(body.endsAt === '' ? null : body.endsAt, 'endsAt');
    }
  } catch {
    throw new AppError('VALIDATION', 'Invalid schedule date', 400);
  }
  return { startsAt, endsAt };
}

export const adminAnnouncementsRoutes: FastifyPluginAsync = async (app) => {
  const ctx = (): AppCtx => app.ctx;
  const guard = { preHandler: adminBearerPreHandler(ctx().env) };

  app.get('/announcements', { ...guard }, async (_req, reply) => {
    try {
      const items = await listAllAnnouncementsAdmin();
      return reply.send({ items });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.post('/announcements', { ...guard }, async (req, reply) => {
    try {
      const parsed = announcementBody.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      }
      const { startsAt, endsAt } = bodyToScheduleFields(parsed.data);
      const item = await createAnnouncement({
        titleAr: parsed.data.titleAr.trim(),
        titleEn: parsed.data.titleEn.trim(),
        bodyAr: parsed.data.bodyAr.trim(),
        bodyEn: parsed.data.bodyEn.trim(),
        variant: parsed.data.variant as AnnouncementVariant | undefined,
        sortOrder: parsed.data.sortOrder,
        isEnabled: parsed.data.isEnabled,
        dismissible: parsed.data.dismissible,
        linkUrl: normalizeLinkUrl(parsed.data.linkUrl) ?? null,
        startsAt: startsAt ?? null,
        endsAt: endsAt ?? null,
        createdByAdminId: req.admin!.id,
      });
      await writeAdminAudit(
        req.admin!.id,
        'admin.announcements.create',
        { id: item.id, titleEn: item.titleEn },
        clientIp(req),
      );
      return reply.status(201).send({ item });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.patch('/announcements/:id', { ...guard }, async (req, reply) => {
    try {
      const id = (req.params as { id: string }).id;
      const parsed = patchAnnouncementBody.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      }
      const { startsAt, endsAt } = bodyToScheduleFields(parsed.data);
      const item = await updateAnnouncement(id, {
        titleAr: parsed.data.titleAr?.trim(),
        titleEn: parsed.data.titleEn?.trim(),
        bodyAr: parsed.data.bodyAr?.trim(),
        bodyEn: parsed.data.bodyEn?.trim(),
        variant: parsed.data.variant as AnnouncementVariant | undefined,
        sortOrder: parsed.data.sortOrder,
        isEnabled: parsed.data.isEnabled,
        dismissible: parsed.data.dismissible,
        linkUrl: normalizeLinkUrl(parsed.data.linkUrl),
        startsAt,
        endsAt,
      });
      if (!item) {
        throw new AppError('NOT_FOUND', 'Announcement not found', 404);
      }
      await writeAdminAudit(
        req.admin!.id,
        'admin.announcements.update',
        { id: item.id },
        clientIp(req),
      );
      return reply.send({ item });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.delete('/announcements/:id', { ...guard }, async (req, reply) => {
    try {
      const id = (req.params as { id: string }).id;
      const ok = await deleteAnnouncement(id);
      if (!ok) {
        throw new AppError('NOT_FOUND', 'Announcement not found', 404);
      }
      await writeAdminAudit(
        req.admin!.id,
        'admin.announcements.delete',
        { id },
        clientIp(req),
      );
      return reply.status(204).send();
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });
};
