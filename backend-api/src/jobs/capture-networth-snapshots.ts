import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import type { AppCtx } from '../app-context.js';
import { prisma } from '../lib/prisma.js';
import { withRedisLeader } from '../lib/redis-leader.js';
import { captureSnapshot, currentPeriodMonth } from '../services/net-worth-snapshots.js';

const LEADER_LOCK_KEY = 'jobs:networth-snapshots:leader';
const LAST_MONTH_KEY = 'jobs:networth-snapshots:last-month';

const holderId = randomUUID();
let timer: ReturnType<typeof setInterval> | null = null;
let tickInFlight = false;

function periodMonthKey(): string {
  return currentPeriodMonth().toISOString().slice(0, 7); // YYYY-MM
}

export type SnapshotTickResult = {
  ran: boolean;
  processed?: number;
  failed?: number;
};

/**
 * Capture this month's net worth snapshot for consumers that have any wealth data
 * (journal entries or manual components). Idempotent per month via Redis marker and
 * the per-consumer per-month unique upsert.
 */
export async function runSnapshotTick(ctx: AppCtx, log: Logger): Promise<SnapshotTickResult> {
  const monthKey = periodMonthKey();
  if ((await ctx.redis.get(LAST_MONTH_KEY)) === monthKey) {
    return { ran: false };
  }

  const consumers = await prisma.consumerUser.findMany({
    where: {
      OR: [{ journalEntries: { some: {} } }, { netWorthComponents: { some: {} } }],
    },
    select: { id: true },
    take: ctx.env.NETWORTH_SNAPSHOT_BATCH_SIZE,
  });

  let processed = 0;
  let failed = 0;
  for (const { id } of consumers) {
    try {
      await captureSnapshot(id, { env: ctx.env, redis: ctx.redis, log });
      processed += 1;
    } catch (e) {
      failed += 1;
      log.warn({ err: e, consumerUserId: id }, 'networth snapshot capture failed');
    }
  }

  // Only mark the month done when we processed the full eligible set (no truncation by batch size).
  if (consumers.length < ctx.env.NETWORTH_SNAPSHOT_BATCH_SIZE) {
    await ctx.redis.set(LAST_MONTH_KEY, monthKey, 'EX', 60 * 60 * 24 * 40);
  }

  log.info({ month: monthKey, processed, failed }, 'networth snapshots captured');
  return { ran: true, processed, failed };
}

async function runTick(ctx: AppCtx, log: Logger): Promise<void> {
  if (tickInFlight) return;
  const isLeader = await withRedisLeader(
    ctx.redis,
    LEADER_LOCK_KEY,
    holderId,
    ctx.env.NETWORTH_SNAPSHOT_LEADER_TTL_SEC,
  );
  if (!isLeader) return;

  tickInFlight = true;
  try {
    await runSnapshotTick(ctx, log);
  } catch (e) {
    log.error({ err: e }, 'networth snapshot tick error');
  } finally {
    tickInFlight = false;
  }
}

export function startNetWorthSnapshots(ctx: AppCtx, log: Logger): void {
  if (!ctx.env.NETWORTH_SNAPSHOT_ENABLED || ctx.env.NODE_ENV === 'test') {
    log.info('networth snapshots disabled');
    return;
  }
  const intervalMs = ctx.env.NETWORTH_SNAPSHOT_CHECK_INTERVAL_SEC * 1000;
  log.info({ holderId, checkIntervalSec: ctx.env.NETWORTH_SNAPSHOT_CHECK_INTERVAL_SEC }, 'networth snapshots starting');
  void runTick(ctx, log);
  timer = setInterval(() => {
    void runTick(ctx, log);
  }, intervalMs);
}

export function stopNetWorthSnapshots(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/** Test helper — reset month idempotency marker. */
export async function clearSnapshotMonthMarker(ctx: AppCtx): Promise<void> {
  await ctx.redis.del(LAST_MONTH_KEY);
}
