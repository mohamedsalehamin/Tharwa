import type { FastifyPluginAsync } from 'fastify';
import type { AppCtx } from '../../app-context.js';
import { AppError, sendError } from '../../lib/errors.js';
import { adminBearerPreHandler } from '../../plugins/admin-bearer.js';
import { writeAdminAudit } from '../../services/admin-audit.js';
import {
  listMasarBenchmarks,
  masarBenchmarkBody,
  presentMasarBenchmark,
  upsertMasarBenchmark,
  zodMasarBenchmarkMessage,
} from '../../services/masar-benchmark.js';

function clientIp(req: { ip?: string; headers: Record<string, unknown> }): string | undefined {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length > 0) return xf.split(',')[0]?.trim();
  return req.ip;
}

export const adminMasarBenchmarkRoutes: FastifyPluginAsync = async (app) => {
  const ctx = (): AppCtx => app.ctx;
  const guard = { preHandler: adminBearerPreHandler(ctx().env) };

  app.get('/masar-benchmarks', { ...guard }, async (_req, reply) => {
    try {
      const rows = await listMasarBenchmarks();
      return reply.send({ items: rows.map(presentMasarBenchmark) });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.put('/masar-benchmarks', { ...guard }, async (req, reply) => {
    try {
      const admin = req.admin!;
      const parsed = masarBenchmarkBody.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodMasarBenchmarkMessage(parsed.error), 400);
      }
      const row = await upsertMasarBenchmark(parsed.data);
      await writeAdminAudit(
        admin.id,
        'admin.masar_benchmark.upsert',
        { periodMonth: row.periodMonth.toISOString().slice(0, 10), sourceLabel: row.sourceLabel },
        clientIp(req),
      );
      return reply.send(presentMasarBenchmark(row));
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });
};
