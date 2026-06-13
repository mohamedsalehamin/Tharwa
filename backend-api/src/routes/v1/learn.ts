import type { FastifyPluginAsync } from 'fastify';
import {
  getPublishedLearnArticle,
  listPublishedGlossaryCategories,
  listPublishedLearnArticles,
  listPublishedLearnCourses,
} from '../../services/learn-content.js';

export const v1LearnRoutes: FastifyPluginAsync = async (app) => {
  app.get('/learn/glossary', async (_req, reply) => {
    const categories = await listPublishedGlossaryCategories();
    return reply.send({ categories });
  });

  app.get('/learn/articles', async (_req, reply) => {
    const items = await listPublishedLearnArticles();
    return reply.send({ items });
  });

  app.get('/learn/articles/:slug', async (req, reply) => {
    const slug = (req.params as { slug: string }).slug;
    const article = await getPublishedLearnArticle(slug);
    if (!article) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Article not found' } });
    }
    return reply.send({ article });
  });

  app.get('/learn/courses', async (_req, reply) => {
    const items = await listPublishedLearnCourses();
    return reply.send({ items });
  });
};
