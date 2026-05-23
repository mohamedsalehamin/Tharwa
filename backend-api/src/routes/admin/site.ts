import type { FastifyPluginAsync } from 'fastify';
import { SiteMenuLinkType, SiteMenuPlacement, SitePageKind } from '@prisma/client';
import { z } from 'zod';
import type { AppCtx } from '../../app-context.js';
import { AppError, sendError } from '../../lib/errors.js';
import { clientIp } from '../../lib/client-ip.js';
import { adminBearerPreHandler } from '../../plugins/admin-bearer.js';
import { writeAdminAudit } from '../../services/admin-audit.js';
import {
  createSiteMenuItem,
  deleteSiteMenuItem,
  listAllSiteMenuItemsAdmin,
  updateSiteMenuItem,
} from '../../services/site-menu.js';
import {
  createSitePage,
  deleteSitePage,
  listAllSitePagesAdmin,
  updateSitePage,
} from '../../services/site-pages.js';

const pageKindEnum = z.enum(['standard', 'contact']);
const placementEnum = z.enum(['header', 'footer']);
const linkTypeEnum = z.enum(['page', 'external']);

const pageBodyBase = z.object({
  slug: z.string().trim().min(1).max(80),
  titleAr: z.string().trim().min(1).max(200),
  titleEn: z.string().trim().min(1).max(200),
  contentAr: z.string().max(50000),
  contentEn: z.string().max(50000),
  kind: pageKindEnum.optional(),
  isPublished: z.boolean().optional(),
});

const pageBody = pageBodyBase;
const patchPageBody = pageBodyBase.partial().refine(
  (b) => Object.values(b).some((v) => v !== undefined),
  { message: 'At least one field is required' },
);

const menuBody = z.object({
  placement: placementEnum,
  labelAr: z.string().trim().min(1).max(120),
  labelEn: z.string().trim().min(1).max(120),
  linkType: linkTypeEnum,
  pageId: z.union([z.string().uuid(), z.literal(''), z.null()]).optional(),
  externalUrl: z.union([z.string().url().max(500), z.literal(''), z.null()]).optional(),
  sortOrder: z.number().int().min(-1000).max(1000).optional(),
  isEnabled: z.boolean().optional(),
});

const patchMenuBody = menuBody.partial().refine(
  (b) => Object.values(b).some((v) => v !== undefined),
  { message: 'At least one field is required' },
);

function zodMessage(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
}

function normalizeOptionalId(raw: string | null | undefined): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  return raw;
}

function normalizeExternalUrl(raw: string | null | undefined): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  return raw;
}

function mapDomainError(e: unknown): never {
  if (e instanceof Error) {
    throw new AppError('VALIDATION', e.message, 400);
  }
  throw e;
}

export const adminSiteRoutes: FastifyPluginAsync = async (app) => {
  const ctx = (): AppCtx => app.ctx;
  const guard = { preHandler: adminBearerPreHandler(ctx().env) };

  app.get('/site/pages', { ...guard }, async (_req, reply) => {
    try {
      const items = await listAllSitePagesAdmin();
      return reply.send({ items });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.post('/site/pages', { ...guard }, async (req, reply) => {
    try {
      const parsed = pageBody.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      }
      let item;
      try {
        item = await createSitePage({
          slug: parsed.data.slug,
          titleAr: parsed.data.titleAr,
          titleEn: parsed.data.titleEn,
          contentAr: parsed.data.contentAr,
          contentEn: parsed.data.contentEn,
          kind: parsed.data.kind as SitePageKind | undefined,
          isPublished: parsed.data.isPublished,
        });
      } catch (e) {
        mapDomainError(e);
      }
      await writeAdminAudit(
        req.admin!.id,
        'admin.site.pages.create',
        { id: item.id, slug: item.slug },
        clientIp(req),
      );
      return reply.status(201).send({ item });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.patch('/site/pages/:id', { ...guard }, async (req, reply) => {
    try {
      const id = (req.params as { id: string }).id;
      const parsed = patchPageBody.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      }
      let item;
      try {
        item = await updateSitePage(id, {
          slug: parsed.data.slug,
          titleAr: parsed.data.titleAr,
          titleEn: parsed.data.titleEn,
          contentAr: parsed.data.contentAr,
          contentEn: parsed.data.contentEn,
          kind: parsed.data.kind as SitePageKind | undefined,
          isPublished: parsed.data.isPublished,
        });
      } catch (e) {
        mapDomainError(e);
      }
      if (!item) {
        throw new AppError('NOT_FOUND', 'Page not found', 404);
      }
      await writeAdminAudit(
        req.admin!.id,
        'admin.site.pages.update',
        { id: item.id },
        clientIp(req),
      );
      return reply.send({ item });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.delete('/site/pages/:id', { ...guard }, async (req, reply) => {
    try {
      const id = (req.params as { id: string }).id;
      const ok = await deleteSitePage(id);
      if (!ok) {
        throw new AppError('NOT_FOUND', 'Page not found', 404);
      }
      await writeAdminAudit(
        req.admin!.id,
        'admin.site.pages.delete',
        { id },
        clientIp(req),
      );
      return reply.status(204).send();
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.get('/site/menu-items', { ...guard }, async (_req, reply) => {
    try {
      const items = await listAllSiteMenuItemsAdmin();
      return reply.send({ items });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.post('/site/menu-items', { ...guard }, async (req, reply) => {
    try {
      const parsed = menuBody.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      }
      let item;
      try {
        item = await createSiteMenuItem({
          placement: parsed.data.placement as SiteMenuPlacement,
          labelAr: parsed.data.labelAr,
          labelEn: parsed.data.labelEn,
          linkType: parsed.data.linkType as SiteMenuLinkType,
          pageId: normalizeOptionalId(parsed.data.pageId) ?? null,
          externalUrl: normalizeExternalUrl(parsed.data.externalUrl) ?? null,
          sortOrder: parsed.data.sortOrder,
          isEnabled: parsed.data.isEnabled,
        });
      } catch (e) {
        mapDomainError(e);
      }
      await writeAdminAudit(
        req.admin!.id,
        'admin.site.menu.create',
        { id: item.id },
        clientIp(req),
      );
      return reply.status(201).send({ item });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.patch('/site/menu-items/:id', { ...guard }, async (req, reply) => {
    try {
      const id = (req.params as { id: string }).id;
      const parsed = patchMenuBody.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      }
      let item;
      try {
        item = await updateSiteMenuItem(id, {
          placement: parsed.data.placement as SiteMenuPlacement | undefined,
          labelAr: parsed.data.labelAr,
          labelEn: parsed.data.labelEn,
          linkType: parsed.data.linkType as SiteMenuLinkType | undefined,
          pageId: normalizeOptionalId(parsed.data.pageId),
          externalUrl: normalizeExternalUrl(parsed.data.externalUrl),
          sortOrder: parsed.data.sortOrder,
          isEnabled: parsed.data.isEnabled,
        });
      } catch (e) {
        mapDomainError(e);
      }
      if (!item) {
        throw new AppError('NOT_FOUND', 'Menu item not found', 404);
      }
      await writeAdminAudit(
        req.admin!.id,
        'admin.site.menu.update',
        { id: item.id },
        clientIp(req),
      );
      return reply.send({ item });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.delete('/site/menu-items/:id', { ...guard }, async (req, reply) => {
    try {
      const id = (req.params as { id: string }).id;
      const ok = await deleteSiteMenuItem(id);
      if (!ok) {
        throw new AppError('NOT_FOUND', 'Menu item not found', 404);
      }
      await writeAdminAudit(
        req.admin!.id,
        'admin.site.menu.delete',
        { id },
        clientIp(req),
      );
      return reply.status(204).send();
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });
};
