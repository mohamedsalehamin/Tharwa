import type { FastifyPluginAsync } from 'fastify';
import type { FinancialGoal } from '@prisma/client';
import type { AppCtx } from '../../app-context.js';
import { AppError, sendError } from '../../lib/errors.js';
import { consumerBearerPreHandler } from '../../plugins/consumer-bearer.js';
import { buildNetWorthSummary, type NetWorthSummary } from '../../services/net-worth.js';
import {
  createGoal,
  deleteGoal,
  goalBody,
  GOALS_DISCLAIMER,
  listGoals,
  presentGoal,
  updateGoal,
  zodGoalMessage,
} from '../../services/financial-goals.js';

const UUID_RE = /^[0-9a-f-]{36}$/i;

function savedFromSummary(row: FinancialGoal, summary: NetWorthSummary | null): number {
  if (row.savedSource === 'manual') {
    return row.manualSavedEgp != null ? Number(row.manualSavedEgp) : 0;
  }
  if (!summary) return 0;
  if (row.savedSource === 'net_worth') return summary.totalEgp;
  // category
  const sub = summary.breakdown.find((b) => b.category === row.savedCategory);
  return sub ? sub.totalEgp : 0;
}

export const v1GoalsRoutes: FastifyPluginAsync = async (app) => {
  const ctx = (): AppCtx => app.ctx;
  const guard = { preHandler: consumerBearerPreHandler(ctx().env) };

  app.get('/goals', { ...guard }, async (req, reply) => {
    try {
      const c = ctx();
      const rows = await listGoals(req.consumer!.id);
      const needsSummary = rows.some((r) => r.savedSource !== 'manual');
      const summary = needsSummary
        ? await buildNetWorthSummary(req.consumer!.id, { env: c.env, redis: c.redis, log: app.log })
        : null;

      const now = new Date();
      const items = rows.map((r) => presentGoal(r, savedFromSummary(r, summary), now));
      const totalRequiredMonthlyEgp = items.reduce((acc, g) => acc + g.requiredMonthlyEgp, 0);
      return reply.send({
        disclaimer: GOALS_DISCLAIMER,
        totalRequiredMonthlyEgp: Math.round((totalRequiredMonthlyEgp + Number.EPSILON) * 100) / 100,
        items,
      });
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.post('/goals', { ...guard }, async (req, reply) => {
    try {
      const parsed = goalBody.safeParse(req.body);
      if (!parsed.success) throw new AppError('VALIDATION', zodGoalMessage(parsed.error), 400);
      const c = ctx();
      const row = await createGoal(req.consumer!.id, parsed.data);
      const summary =
        row.savedSource !== 'manual'
          ? await buildNetWorthSummary(req.consumer!.id, { env: c.env, redis: c.redis, log: app.log })
          : null;
      return reply.status(201).send(presentGoal(row, savedFromSummary(row, summary)));
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.put('/goals/:id', { ...guard }, async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      if (!UUID_RE.test(id)) throw new AppError('VALIDATION', 'Invalid goal id', 400);
      const parsed = goalBody.safeParse(req.body);
      if (!parsed.success) throw new AppError('VALIDATION', zodGoalMessage(parsed.error), 400);
      const c = ctx();
      const row = await updateGoal(req.consumer!.id, id, parsed.data);
      const summary =
        row.savedSource !== 'manual'
          ? await buildNetWorthSummary(req.consumer!.id, { env: c.env, redis: c.redis, log: app.log })
          : null;
      return reply.send(presentGoal(row, savedFromSummary(row, summary)));
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });

  app.delete('/goals/:id', { ...guard }, async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      if (!UUID_RE.test(id)) throw new AppError('VALIDATION', 'Invalid goal id', 400);
      await deleteGoal(req.consumer!.id, id);
      return reply.status(204).send();
    } catch (e) {
      if (!reply.sent) sendError(reply, e);
    }
  });
};
