import type { FastifyPluginAsync } from 'fastify';
import type { AppCtx } from '../../app-context.js';
import { AppError, sendError } from '../../lib/errors.js';
import { consumerBearerPreHandler } from '../../plugins/consumer-bearer.js';
import { computeZakat, loadZakatNisab, buildZakatPrefill } from '../../services/zakat.js';
import {
  mapZakatComputeBodyToInput,
  zakatComputeBody,
  zakatSessionCreateBody,
  zodZakatMessage,
} from '../../services/zakat-validation.js';
import { getMetalsCached } from '../../services/quotes.js';
import { getZakatMethodologyPayload } from '../../services/zakat-methodology.js';
import {
  createZakatSession,
  deleteZakatSession,
  getZakatSession,
  listZakatSessions,
} from '../../services/zakat-sessions.js';

export const v1ZakatRoutes: FastifyPluginAsync = async (app) => {
  const ctx = (): AppCtx => app.ctx;
  const guard = { preHandler: consumerBearerPreHandler(ctx().env) };

  app.get('/zakat/nisab', async (_req, reply) => {
    try {
      const c = ctx();
      const nisab = await loadZakatNisab(c.env, c.redis, app.log);
      return reply.send(nisab);
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });

  app.get('/zakat/methodology', async (_req, reply) => {
    return reply.send(getZakatMethodologyPayload());
  });

  app.post('/zakat/compute', async (req, reply) => {
    try {
      const parsed = zakatComputeBody.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodZakatMessage(parsed.error), 400);
      }
      const c = ctx();
      const [nisab, metals] = await Promise.all([
        loadZakatNisab(c.env, c.redis, app.log),
        getMetalsCached(c.env, c.redis, app.log),
      ]);
      const result = computeZakat(mapZakatComputeBodyToInput(parsed.data), metals.items, nisab);
      return reply.send({ nisab, ...result });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });

  app.get('/zakat/prefill', { ...guard }, async (req, reply) => {
    try {
      const userId = req.consumer!.id;
      const c = ctx();
      const prefill = await buildZakatPrefill(userId, {
        env: c.env,
        redis: c.redis,
        log: app.log,
      });
      return reply.send(prefill);
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });

  app.get('/zakat/sessions', { ...guard }, async (req, reply) => {
    try {
      const userId = req.consumer!.id;
      return reply.send(await listZakatSessions(userId));
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });

  app.get('/zakat/sessions/:id', { ...guard }, async (req, reply) => {
    try {
      const userId = req.consumer!.id;
      const { id } = req.params as { id: string };
      if (!/^[0-9a-f-]{36}$/i.test(id)) {
        throw new AppError('VALIDATION', 'Invalid session id', 400);
      }
      return reply.send(await getZakatSession(userId, id));
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });

  app.post('/zakat/sessions', { ...guard }, async (req, reply) => {
    try {
      const parsed = zakatSessionCreateBody.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodZakatMessage(parsed.error), 400);
      }
      const userId = req.consumer!.id;
      const c = ctx();
      const { session, result } = await createZakatSession(
        userId,
        parsed.data.label,
        mapZakatComputeBodyToInput(parsed.data.inputs),
        c.env,
        c.redis,
        app.log,
      );
      return reply.status(201).send({ session, result });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });

  app.delete('/zakat/sessions/:id', { ...guard }, async (req, reply) => {
    try {
      const userId = req.consumer!.id;
      const { id } = req.params as { id: string };
      if (!/^[0-9a-f-]{36}$/i.test(id)) {
        throw new AppError('VALIDATION', 'Invalid session id', 400);
      }
      await deleteZakatSession(userId, id);
      return reply.status(204).send();
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
      return;
    }
  });
};
