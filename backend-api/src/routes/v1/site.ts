import type { FastifyPluginAsync } from 'fastify';
import { AppError, sendError } from '../../lib/errors.js';
import { getPublicNavigation } from '../../services/site-menu.js';
import { getPublishedSitePage } from '../../services/site-pages.js';

export const v1SiteRoutes: FastifyPluginAsync = async (app) => {
  app.get('/site/navigation', async (_req, reply) => {
    try {
      const nav = await getPublicNavigation();
      return reply.send(nav);
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.get('/site/pages/:slug', async (req, reply) => {
    try {
      const slug = (req.params as { slug: string }).slug;
      const page = await getPublishedSitePage(slug);
      if (!page) {
        throw new AppError('NOT_FOUND', 'Page not found', 404);
      }
      return reply.send({ page });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });
};
