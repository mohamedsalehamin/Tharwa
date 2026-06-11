import type { FastifyPluginAsync } from 'fastify';
import type { AppCtx } from '../../app-context.js';
import { AppError, sendError } from '../../lib/errors.js';
import { adminBearerPreHandler } from '../../plugins/admin-bearer.js';
import { writeAdminAudit } from '../../services/admin-audit.js';
import {
  inflationBenchmarkBody,
  listInflationBenchmarks,
  presentInflationBenchmark,
  upsertInflationBenchmark,
  zodInflationMessage,
} from '../../services/inflation-benchmark.js';

function clientIp(req: { ip?: string; headers: Record<string, unknown> }): string | undefined {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length > 0) return xf.split(',')[0]?.trim();
  return req.ip;
}

export const adminInflationBenchmarkRoutes: FastifyPluginAsync = async (app) => {
  const ctx = (): AppCtx => app.ctx;
  const guard = { preHandler: adminBearerPreHandler(ctx().env) };

  app.get('/inflation-benchmarks', { ...guard }, async (_req, reply) => {
    try {
      const rows = await listInflationBenchmarks();
      return reply.send({ items: rows.map(presentInflationBenchmark) });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.put('/inflation-benchmarks', { ...guard }, async (req, reply) => {
    try {
      const admin = req.admin!;
      const parsed = inflationBenchmarkBody.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION', zodInflationMessage(parsed.error), 400);
      }
      const row = await upsertInflationBenchmark(parsed.data);
      await writeAdminAudit(
        admin.id,
        'admin.inflation_benchmark.upsert',
        { periodMonth: row.periodMonth.toISOString().slice(0, 10), sourceLabel: row.sourceLabel },
        clientIp(req),
      );
      return reply.send(presentInflationBenchmark(row));
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });
};
