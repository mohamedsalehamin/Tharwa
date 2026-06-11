import type { FastifyPluginAsync } from 'fastify';
import type { AppCtx } from '../../app-context.js';
import { AppError, sendError } from '../../lib/errors.js';
import { consumerBearerPreHandler } from '../../plugins/consumer-bearer.js';
import { getEgpConverter } from '../../lib/egp-convert.js';
import { buildNetWorthSummary } from '../../services/net-worth.js';
import {
  createComponent,
  deleteComponent,
  listComponents,
  manualComponentBody,
  presentComponent,
  updateComponent,
  zodComponentMessage,
} from '../../services/net-worth-components.js';
import { captureSnapshot, listSnapshots } from '../../services/net-worth-snapshots.js';
import { buildRealReturn } from '../../services/real-return.js';

const UUID_RE = /^[0-9a-f-]{36}$/i;

function parseMonths(raw: unknown, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(120, Math.max(1, Math.trunc(n)));
}

export const v1NetWorthRoutes: FastifyPluginAsync = async (app) => {
  const ctx = (): AppCtx => app.ctx;
  const guard = { preHandler: consumerBearerPreHandler(ctx().env) };

  app.get('/networth', { ...guard }, async (req, reply) => {
    try {
      const c = ctx();
      const summary = await buildNetWorthSummary(req.consumer!.id, {
        env: c.env,
        redis: c.redis,
        log: app.log,
      });
      return reply.send(summary);
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.get('/networth/components', { ...guard }, async (req, reply) => {
    try {
      const c = ctx();
      const [rows, { convert }] = await Promise.all([
        listComponents(req.consumer!.id),
        getEgpConverter(c.env, c.redis, app.log),
      ]);
      return reply.send({ items: rows.map((r) => presentComponent(r, convert)) });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.post('/networth/components', { ...guard }, async (req, reply) => {
    try {
      const parsed = manualComponentBody.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodComponentMessage(parsed.error), 400);
      }
      const c = ctx();
      const [row, { convert }] = await Promise.all([
        createComponent(req.consumer!.id, parsed.data),
        getEgpConverter(c.env, c.redis, app.log),
      ]);
      return reply.status(201).send(presentComponent(row, convert));
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.put('/networth/components/:id', { ...guard }, async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      if (!UUID_RE.test(id)) throw new AppError('VALIDATION', 'Invalid component id', 400);
      const parsed = manualComponentBody.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodComponentMessage(parsed.error), 400);
      }
      const c = ctx();
      const [row, { convert }] = await Promise.all([
        updateComponent(req.consumer!.id, id, parsed.data),
        getEgpConverter(c.env, c.redis, app.log),
      ]);
      return reply.send(presentComponent(row, convert));
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.delete('/networth/components/:id', { ...guard }, async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      if (!UUID_RE.test(id)) throw new AppError('VALIDATION', 'Invalid component id', 400);
      await deleteComponent(req.consumer!.id, id);
      return reply.status(204).send();
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.get('/networth/snapshots', { ...guard }, async (req, reply) => {
    try {
      const months = parseMonths((req.query as { months?: unknown })?.months, 24);
      const items = await listSnapshots(req.consumer!.id, months);
      return reply.send({ items });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.post('/networth/snapshots', { ...guard }, async (req, reply) => {
    try {
      const c = ctx();
      const snap = await captureSnapshot(req.consumer!.id, {
        env: c.env,
        redis: c.redis,
        log: app.log,
      });
      return reply.send(snap);
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.get('/networth/real-return', { ...guard }, async (req, reply) => {
    try {
      const months = parseMonths((req.query as { months?: unknown })?.months, 12);
      const result = await buildRealReturn(req.consumer!.id, months);
      return reply.send(result);
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });
};
