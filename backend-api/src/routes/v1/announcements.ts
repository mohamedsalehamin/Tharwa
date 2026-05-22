import type { FastifyPluginAsync } from 'fastify';
import { listActiveAnnouncements } from '../../services/announcements.js';
import { sendError } from '../../lib/errors.js';

export const v1AnnouncementsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/announcements', async (_req, reply) => {
    try {
      const items = await listActiveAnnouncements();
      return reply.send({ items });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });
};
