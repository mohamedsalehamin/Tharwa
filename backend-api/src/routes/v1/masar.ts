import type { FastifyPluginAsync } from 'fastify';
import type { AppCtx } from '../../app-context.js';
import { AppError, sendError } from '../../lib/errors.js';
import { consumerBearerPreHandler } from '../../plugins/consumer-bearer.js';
import { computeMasarIllustration } from '../../services/masar-illustration.js';
import {
  deleteMasarProfile,
  getMasarProfile,
  presentMasarProfile,
  saveMasarProfile,
} from '../../services/masar-profile.js';
import {
  computeMasarResult,
  listArchetypeCatalog,
  MASAR_DISCLAIMER,
} from '../../services/masar-result.js';
import {
  illustrationBody,
  masarProfileBody,
  quizAnswersBody,
  zodMasarMessage,
} from '../../services/masar-validation.js';

export const v1MasarRoutes: FastifyPluginAsync = async (app) => {
  const ctx = (): AppCtx => app.ctx;
  const guard = { preHandler: consumerBearerPreHandler(ctx().env) };

  app.get('/masar/archetypes', async (_req, reply) => {
    try {
      return reply.send({
        disclaimer: MASAR_DISCLAIMER,
        items: listArchetypeCatalog(),
      });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.post('/masar/result', async (req, reply) => {
    try {
      const parsed = quizAnswersBody.safeParse(req.body);
      if (!parsed.success) throw new AppError('VALIDATION', zodMasarMessage(parsed.error), 400);
      return reply.send(computeMasarResult(parsed.data));
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.post('/masar/illustration', async (req, reply) => {
    try {
      const parsed = illustrationBody.safeParse(req.body);
      if (!parsed.success) throw new AppError('VALIDATION', zodMasarMessage(parsed.error), 400);
      const result = await computeMasarIllustration(parsed.data.allocation, parsed.data.months);
      return reply.send(result);
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.get('/masar/profile', { ...guard }, async (req, reply) => {
    try {
      const row = await getMasarProfile(req.consumer!.id);
      return reply.send({ profile: row ? presentMasarProfile(row) : null });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.put('/masar/profile', { ...guard }, async (req, reply) => {
    try {
      const parsed = masarProfileBody.safeParse(req.body);
      if (!parsed.success) throw new AppError('VALIDATION', zodMasarMessage(parsed.error), 400);
      const row = await saveMasarProfile(req.consumer!.id, parsed.data);
      return reply.send(presentMasarProfile(row));
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.delete('/masar/profile', { ...guard }, async (req, reply) => {
    try {
      await deleteMasarProfile(req.consumer!.id);
      return reply.status(204).send();
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });
};
