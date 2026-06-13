import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { AppCtx } from '../../app-context.js';
import { AppError, sendError } from '../../lib/errors.js';
import { adminBearerPreHandler } from '../../plugins/admin-bearer.js';
import { writeAdminAudit } from '../../services/admin-audit.js';
import {
  createGlossaryCategory,
  createGlossaryTerm,
  createLearnArticle,
  createLearnCourseCategory,
  createLearnCourse,
  createLearnCourseLesson,
  deleteGlossaryCategory,
  deleteGlossaryTerm,
  deleteLearnArticle,
  deleteLearnCourse,
  deleteLearnCourseCategory,
  deleteLearnCourseLesson,
  importYoutubePlaylistToCourse,
  listGlossaryCategoriesAdmin,
  listLearnArticlesAdmin,
  listLearnCourseCategoriesAdmin,
  parseYoutubeVideoId,
  updateGlossaryCategory,
  updateGlossaryTerm,
  updateLearnArticle,
  updateLearnCourse,
  updateLearnCourseCategory,
  updateLearnCourseLesson,
} from '../../services/learn-content.js';

const shortText = z.string().min(1).max(200);
const richText = z.string().min(1).max(50_000);

const glossaryCategoryBody = z.object({
  titleAr: shortText,
  titleEn: shortText,
  sortOrder: z.number().int().min(-1000).max(1000).optional(),
  isPublished: z.boolean().optional(),
});

const glossaryBody = z.object({
  categoryId: z.string().uuid(),
  termAr: shortText,
  termEn: shortText,
  definitionAr: richText,
  definitionEn: richText,
  sortOrder: z.number().int().min(-1000).max(1000).optional(),
  isPublished: z.boolean().optional(),
});

const articleBody = z.object({
  slug: z.string().min(1).max(120),
  titleAr: shortText,
  titleEn: shortText,
  excerptAr: z.string().max(500).optional().nullable(),
  excerptEn: z.string().max(500).optional().nullable(),
  contentAr: richText,
  contentEn: richText,
  sortOrder: z.number().int().min(-1000).max(1000).optional(),
  isPublished: z.boolean().optional(),
  publishedAt: z.union([z.string().min(1).max(40), z.literal(''), z.null()]).optional(),
});

const categoryBody = z.object({
  titleAr: shortText,
  titleEn: shortText,
  descriptionAr: z.string().max(2000).optional().nullable(),
  descriptionEn: z.string().max(2000).optional().nullable(),
  sortOrder: z.number().int().min(-1000).max(1000).optional(),
  isPublished: z.boolean().optional(),
});

const lessonBody = z.object({
  titleAr: shortText,
  titleEn: shortText,
  descriptionAr: z.string().max(2000).optional().nullable(),
  descriptionEn: z.string().max(2000).optional().nullable(),
  youtubeVideoId: z.string().min(1).max(500),
  courseId: z.string().uuid().optional().nullable(),
  durationSec: z.number().int().min(0).max(86400).optional().nullable(),
  sortOrder: z.number().int().min(-1000).max(1000).optional(),
  isPublished: z.boolean().optional(),
});

const courseBody = z.object({
  titleAr: shortText,
  titleEn: shortText,
  descriptionAr: z.string().max(2000).optional().nullable(),
  descriptionEn: z.string().max(2000).optional().nullable(),
  sortOrder: z.number().int().min(-1000).max(1000).optional(),
  isPublished: z.boolean().optional(),
});

const importPlaylistBody = z.object({
  playlistUrl: z.string().min(1).max(500),
  courseId: z.string().uuid().optional(),
  titleAr: shortText.optional(),
  titleEn: shortText.optional(),
  isPublished: z.boolean().optional(),
  replaceExisting: z.boolean().optional(),
});

function zodMessage(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
}

function clientIp(req: { ip?: string; headers: Record<string, unknown> }): string | undefined {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length > 0) return xf.split(',')[0]?.trim();
  return req.ip;
}

function parseOptionalDate(raw: string | null | undefined): Date | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) throw new AppError('VALIDATION', 'Invalid publishedAt', 400);
  return d;
}

export const adminLearnRoutes: FastifyPluginAsync = async (app) => {
  const ctx = (): AppCtx => app.ctx;
  const guard = { preHandler: adminBearerPreHandler(ctx().env) };

  // Glossary categories & terms
  app.get('/learn/glossary', { ...guard }, async (_req, reply) => {
    try {
      const categories = await listGlossaryCategoriesAdmin();
      return reply.send({ categories });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.post('/learn/glossary/categories', { ...guard }, async (req, reply) => {
    try {
      const parsed = glossaryCategoryBody.safeParse(req.body);
      if (!parsed.success) throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      const item = await createGlossaryCategory({
        titleAr: parsed.data.titleAr.trim(),
        titleEn: parsed.data.titleEn.trim(),
        sortOrder: parsed.data.sortOrder,
        isPublished: parsed.data.isPublished,
      });
      await writeAdminAudit(req.admin!.id, 'admin.learn.glossary_categories.create', { id: item.id }, clientIp(req));
      return reply.status(201).send({ item });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.patch('/learn/glossary/categories/:id', { ...guard }, async (req, reply) => {
    try {
      const id = (req.params as { id: string }).id;
      const parsed = glossaryCategoryBody.partial().safeParse(req.body);
      if (!parsed.success) throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      const item = await updateGlossaryCategory(id, {
        titleAr: parsed.data.titleAr?.trim(),
        titleEn: parsed.data.titleEn?.trim(),
        sortOrder: parsed.data.sortOrder,
        isPublished: parsed.data.isPublished,
      });
      if (!item) throw new AppError('NOT_FOUND', 'Category not found', 404);
      await writeAdminAudit(req.admin!.id, 'admin.learn.glossary_categories.update', { id }, clientIp(req));
      return reply.send({ item });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.delete('/learn/glossary/categories/:id', { ...guard }, async (req, reply) => {
    try {
      const id = (req.params as { id: string }).id;
      const ok = await deleteGlossaryCategory(id);
      if (!ok) throw new AppError('NOT_FOUND', 'Category not found', 404);
      await writeAdminAudit(req.admin!.id, 'admin.learn.glossary_categories.delete', { id }, clientIp(req));
      return reply.status(204).send();
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.post('/learn/glossary/categories/:categoryId/terms', { ...guard }, async (req, reply) => {
    try {
      const categoryId = (req.params as { categoryId: string }).categoryId;
      const parsed = glossaryBody.omit({ categoryId: true }).safeParse(req.body);
      if (!parsed.success) throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      const item = await createGlossaryTerm({
        categoryId,
        termAr: parsed.data.termAr.trim(),
        termEn: parsed.data.termEn.trim(),
        definitionAr: parsed.data.definitionAr.trim(),
        definitionEn: parsed.data.definitionEn.trim(),
        sortOrder: parsed.data.sortOrder,
        isPublished: parsed.data.isPublished,
      });
      await writeAdminAudit(req.admin!.id, 'admin.learn.glossary.create', { id: item.id }, clientIp(req));
      return reply.status(201).send({ item });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.post('/learn/glossary', { ...guard }, async (req, reply) => {
    try {
      const parsed = glossaryBody.safeParse(req.body);
      if (!parsed.success) throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      const item = await createGlossaryTerm({
        categoryId: parsed.data.categoryId,
        termAr: parsed.data.termAr.trim(),
        termEn: parsed.data.termEn.trim(),
        definitionAr: parsed.data.definitionAr.trim(),
        definitionEn: parsed.data.definitionEn.trim(),
        sortOrder: parsed.data.sortOrder,
        isPublished: parsed.data.isPublished,
      });
      await writeAdminAudit(req.admin!.id, 'admin.learn.glossary.create', { id: item.id }, clientIp(req));
      return reply.status(201).send({ item });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.patch('/learn/glossary/:id', { ...guard }, async (req, reply) => {
    try {
      const id = (req.params as { id: string }).id;
      const parsed = glossaryBody.partial().safeParse(req.body);
      if (!parsed.success) throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      const item = await updateGlossaryTerm(id, {
        categoryId: parsed.data.categoryId,
        termAr: parsed.data.termAr?.trim(),
        termEn: parsed.data.termEn?.trim(),
        definitionAr: parsed.data.definitionAr?.trim(),
        definitionEn: parsed.data.definitionEn?.trim(),
        sortOrder: parsed.data.sortOrder,
        isPublished: parsed.data.isPublished,
      });
      if (!item) throw new AppError('NOT_FOUND', 'Term not found', 404);
      await writeAdminAudit(req.admin!.id, 'admin.learn.glossary.update', { id }, clientIp(req));
      return reply.send({ item });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.delete('/learn/glossary/:id', { ...guard }, async (req, reply) => {
    try {
      const id = (req.params as { id: string }).id;
      const ok = await deleteGlossaryTerm(id);
      if (!ok) throw new AppError('NOT_FOUND', 'Term not found', 404);
      await writeAdminAudit(req.admin!.id, 'admin.learn.glossary.delete', { id }, clientIp(req));
      return reply.status(204).send();
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  // Articles
  app.get('/learn/articles', { ...guard }, async (_req, reply) => {
    try {
      const items = await listLearnArticlesAdmin();
      return reply.send({ items });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.post('/learn/articles', { ...guard }, async (req, reply) => {
    try {
      const parsed = articleBody.safeParse(req.body);
      if (!parsed.success) throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      const publishedAt = parseOptionalDate(parsed.data.publishedAt);
      const item = await createLearnArticle({
        slug: parsed.data.slug.trim().toLowerCase(),
        titleAr: parsed.data.titleAr.trim(),
        titleEn: parsed.data.titleEn.trim(),
        excerptAr: parsed.data.excerptAr?.trim() || null,
        excerptEn: parsed.data.excerptEn?.trim() || null,
        contentAr: parsed.data.contentAr.trim(),
        contentEn: parsed.data.contentEn.trim(),
        sortOrder: parsed.data.sortOrder,
        isPublished: parsed.data.isPublished,
        publishedAt: publishedAt ?? null,
        createdByAdminId: req.admin!.id,
      });
      await writeAdminAudit(req.admin!.id, 'admin.learn.articles.create', { id: item.id }, clientIp(req));
      return reply.status(201).send({ item });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.patch('/learn/articles/:id', { ...guard }, async (req, reply) => {
    try {
      const id = (req.params as { id: string }).id;
      const parsed = articleBody.partial().safeParse(req.body);
      if (!parsed.success) throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      const publishedAt = parseOptionalDate(parsed.data.publishedAt);
      const item = await updateLearnArticle(id, {
        slug: parsed.data.slug?.trim().toLowerCase(),
        titleAr: parsed.data.titleAr?.trim(),
        titleEn: parsed.data.titleEn?.trim(),
        excerptAr: parsed.data.excerptAr?.trim(),
        excerptEn: parsed.data.excerptEn?.trim(),
        contentAr: parsed.data.contentAr?.trim(),
        contentEn: parsed.data.contentEn?.trim(),
        sortOrder: parsed.data.sortOrder,
        isPublished: parsed.data.isPublished,
        publishedAt,
      });
      if (!item) throw new AppError('NOT_FOUND', 'Article not found', 404);
      await writeAdminAudit(req.admin!.id, 'admin.learn.articles.update', { id }, clientIp(req));
      return reply.send({ item });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.delete('/learn/articles/:id', { ...guard }, async (req, reply) => {
    try {
      const id = (req.params as { id: string }).id;
      const ok = await deleteLearnArticle(id);
      if (!ok) throw new AppError('NOT_FOUND', 'Article not found', 404);
      await writeAdminAudit(req.admin!.id, 'admin.learn.articles.delete', { id }, clientIp(req));
      return reply.status(204).send();
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  // Course categories
  app.get('/learn/courses', { ...guard }, async (_req, reply) => {
    try {
      const items = await listLearnCourseCategoriesAdmin();
      return reply.send({ items });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.post('/learn/courses/categories', { ...guard }, async (req, reply) => {
    try {
      const parsed = categoryBody.safeParse(req.body);
      if (!parsed.success) throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      const item = await createLearnCourseCategory({
        titleAr: parsed.data.titleAr.trim(),
        titleEn: parsed.data.titleEn.trim(),
        descriptionAr: parsed.data.descriptionAr?.trim() || null,
        descriptionEn: parsed.data.descriptionEn?.trim() || null,
        sortOrder: parsed.data.sortOrder,
        isPublished: parsed.data.isPublished,
      });
      await writeAdminAudit(req.admin!.id, 'admin.learn.categories.create', { id: item.id }, clientIp(req));
      return reply.status(201).send({ item });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.patch('/learn/courses/categories/:id', { ...guard }, async (req, reply) => {
    try {
      const id = (req.params as { id: string }).id;
      const parsed = categoryBody.partial().safeParse(req.body);
      if (!parsed.success) throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      const item = await updateLearnCourseCategory(id, {
        titleAr: parsed.data.titleAr?.trim(),
        titleEn: parsed.data.titleEn?.trim(),
        descriptionAr: parsed.data.descriptionAr?.trim(),
        descriptionEn: parsed.data.descriptionEn?.trim(),
        sortOrder: parsed.data.sortOrder,
        isPublished: parsed.data.isPublished,
      });
      if (!item) throw new AppError('NOT_FOUND', 'Category not found', 404);
      await writeAdminAudit(req.admin!.id, 'admin.learn.categories.update', { id }, clientIp(req));
      return reply.send({ item });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.delete('/learn/courses/categories/:id', { ...guard }, async (req, reply) => {
    try {
      const id = (req.params as { id: string }).id;
      const ok = await deleteLearnCourseCategory(id);
      if (!ok) throw new AppError('NOT_FOUND', 'Category not found', 404);
      await writeAdminAudit(req.admin!.id, 'admin.learn.categories.delete', { id }, clientIp(req));
      return reply.status(204).send();
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  // Lessons
  app.post('/learn/courses/categories/:categoryId/lessons', { ...guard }, async (req, reply) => {
    try {
      const categoryId = (req.params as { categoryId: string }).categoryId;
      const parsed = lessonBody.safeParse(req.body);
      if (!parsed.success) throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      try {
        parseYoutubeVideoId(parsed.data.youtubeVideoId);
      } catch {
        throw new AppError('VALIDATION', 'Invalid YouTube URL or video ID', 400);
      }
      const item = await createLearnCourseLesson({
        categoryId,
        courseId: parsed.data.courseId ?? null,
        titleAr: parsed.data.titleAr.trim(),
        titleEn: parsed.data.titleEn.trim(),
        descriptionAr: parsed.data.descriptionAr?.trim() || null,
        descriptionEn: parsed.data.descriptionEn?.trim() || null,
        youtubeVideoId: parsed.data.youtubeVideoId.trim(),
        durationSec: parsed.data.durationSec ?? null,
        sortOrder: parsed.data.sortOrder,
        isPublished: parsed.data.isPublished,
      });
      await writeAdminAudit(req.admin!.id, 'admin.learn.lessons.create', { id: item.id }, clientIp(req));
      return reply.status(201).send({ item });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  // Courses within a section
  app.post('/learn/courses/categories/:categoryId/courses', { ...guard }, async (req, reply) => {
    try {
      const categoryId = (req.params as { categoryId: string }).categoryId;
      const parsed = courseBody.safeParse(req.body);
      if (!parsed.success) throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      const item = await createLearnCourse({
        categoryId,
        titleAr: parsed.data.titleAr.trim(),
        titleEn: parsed.data.titleEn.trim(),
        descriptionAr: parsed.data.descriptionAr?.trim() || null,
        descriptionEn: parsed.data.descriptionEn?.trim() || null,
        sortOrder: parsed.data.sortOrder,
        isPublished: parsed.data.isPublished,
      });
      await writeAdminAudit(req.admin!.id, 'admin.learn.courses.create', { id: item.id }, clientIp(req));
      return reply.status(201).send({ item });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.patch('/learn/courses/courses/:id', { ...guard }, async (req, reply) => {
    try {
      const id = (req.params as { id: string }).id;
      const parsed = courseBody.partial().safeParse(req.body);
      if (!parsed.success) throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      const item = await updateLearnCourse(id, {
        titleAr: parsed.data.titleAr?.trim(),
        titleEn: parsed.data.titleEn?.trim(),
        descriptionAr: parsed.data.descriptionAr?.trim(),
        descriptionEn: parsed.data.descriptionEn?.trim(),
        sortOrder: parsed.data.sortOrder,
        isPublished: parsed.data.isPublished,
      });
      if (!item) throw new AppError('NOT_FOUND', 'Course not found', 404);
      await writeAdminAudit(req.admin!.id, 'admin.learn.courses.update', { id }, clientIp(req));
      return reply.send({ item });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.delete('/learn/courses/courses/:id', { ...guard }, async (req, reply) => {
    try {
      const id = (req.params as { id: string }).id;
      const ok = await deleteLearnCourse(id);
      if (!ok) throw new AppError('NOT_FOUND', 'Course not found', 404);
      await writeAdminAudit(req.admin!.id, 'admin.learn.courses.delete', { id }, clientIp(req));
      return reply.status(204).send();
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.post('/learn/courses/categories/:categoryId/import-playlist', { ...guard }, async (req, reply) => {
    try {
      const categoryId = (req.params as { categoryId: string }).categoryId;
      const parsed = importPlaylistBody.safeParse(req.body);
      if (!parsed.success) throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      const result = await importYoutubePlaylistToCourse(
        {
          categoryId,
          playlistUrl: parsed.data.playlistUrl.trim(),
          courseId: parsed.data.courseId,
          titleAr: parsed.data.titleAr?.trim(),
          titleEn: parsed.data.titleEn?.trim(),
          isPublished: parsed.data.isPublished,
          replaceExisting: parsed.data.replaceExisting,
        },
        ctx().env.YOUTUBE_API_KEY,
      );
      await writeAdminAudit(
        req.admin!.id,
        'admin.learn.courses.import_playlist',
        { categoryId, courseId: result.course.id, importedCount: result.importedCount },
        clientIp(req),
      );
      return reply.status(201).send(result);
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.patch('/learn/courses/lessons/:id', { ...guard }, async (req, reply) => {
    try {
      const id = (req.params as { id: string }).id;
      const parsed = lessonBody.partial().safeParse(req.body);
      if (!parsed.success) throw new AppError('VALIDATION', zodMessage(parsed.error), 400);
      if (parsed.data.youtubeVideoId != null) {
        try {
          parseYoutubeVideoId(parsed.data.youtubeVideoId);
        } catch {
          throw new AppError('VALIDATION', 'Invalid YouTube URL or video ID', 400);
        }
      }
      const item = await updateLearnCourseLesson(id, {
        titleAr: parsed.data.titleAr?.trim(),
        titleEn: parsed.data.titleEn?.trim(),
        descriptionAr: parsed.data.descriptionAr?.trim(),
        descriptionEn: parsed.data.descriptionEn?.trim(),
        youtubeVideoId: parsed.data.youtubeVideoId?.trim(),
        durationSec: parsed.data.durationSec,
        sortOrder: parsed.data.sortOrder,
        isPublished: parsed.data.isPublished,
      });
      if (!item) throw new AppError('NOT_FOUND', 'Lesson not found', 404);
      await writeAdminAudit(req.admin!.id, 'admin.learn.lessons.update', { id }, clientIp(req));
      return reply.send({ item });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.delete('/learn/courses/lessons/:id', { ...guard }, async (req, reply) => {
    try {
      const id = (req.params as { id: string }).id;
      const ok = await deleteLearnCourseLesson(id);
      if (!ok) throw new AppError('NOT_FOUND', 'Lesson not found', 404);
      await writeAdminAudit(req.admin!.id, 'admin.learn.lessons.delete', { id }, clientIp(req));
      return reply.status(204).send();
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });
};
