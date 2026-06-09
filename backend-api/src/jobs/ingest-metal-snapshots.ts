import { randomUUID } from 'node:crypto';
import type { FastifyBaseLogger } from 'fastify';
import type { Logger } from 'pino';
import type { AppCtx } from '../app-context.js';
import { withRedisLeader } from '../lib/redis-leader.js';
import { ingestMetalQuotesFromUpstream } from '../services/metal-quote-snapshots.js';

const LEADER_LOCK_KEY = 'jobs:metal-snapshot-ingest:leader';
const LAST_INGEST_KEY = 'jobs:metal-snapshot-ingest:last';

let ingestTimer: ReturnType<typeof setInterval> | null = null;
let tickInFlight = false;
const holderId = randomUUID();

function asRouteLog(log: Logger): FastifyBaseLogger {
  return log as unknown as FastifyBaseLogger;
}

async function ingestTick(ctx: AppCtx, log: Logger): Promise<void> {
  if (tickInFlight) {
    log.debug('metal snapshot ingest: previous tick still running');
    return;
  }

  const isLeader = await withRedisLeader(
    ctx.redis,
    LEADER_LOCK_KEY,
    holderId,
    ctx.env.METALS_SNAPSHOT_LEADER_TTL_SEC,
  );
  if (!isLeader) return;

  const intervalSec = ctx.env.METALS_SNAPSHOT_INTERVAL_SEC;
  const lastRaw = await ctx.redis.get(LAST_INGEST_KEY);
  if (lastRaw) {
    const lastMs = Number.parseInt(lastRaw, 10);
    if (Number.isFinite(lastMs) && Date.now() - lastMs < intervalSec * 1000) {
      return;
    }
  }

  tickInFlight = true;
  const started = Date.now();
  try {
    const result = await ingestMetalQuotesFromUpstream(ctx.env, ctx.redis, asRouteLog(log));
    if (result.ok) {
      await ctx.redis.set(LAST_INGEST_KEY, String(Date.now()), 'EX', 86_400);
    }
    log.info({ result, durationMs: Date.now() - started }, 'metal snapshot ingest tick');
  } catch (e) {
    log.error({ err: e, durationMs: Date.now() - started }, 'metal snapshot ingest tick error');
  } finally {
    tickInFlight = false;
  }
}

/** Persist Telegram metal quotes into `quote_snapshots` on a fixed cadence. */
export function startMetalSnapshotIngest(ctx: AppCtx, log: Logger): void {
  if (!ctx.env.METALS_SNAPSHOT_ENABLED || ctx.env.NODE_ENV === 'test') {
    log.info('metal snapshot ingest disabled');
    return;
  }

  const intervalMs = ctx.env.METALS_SNAPSHOT_INTERVAL_SEC * 1000;
  log.info(
    {
      holderId,
      intervalSec: ctx.env.METALS_SNAPSHOT_INTERVAL_SEC,
    },
    'metal snapshot ingest starting',
  );

  void ingestTick(ctx, log);
  ingestTimer = setInterval(() => {
    void ingestTick(ctx, log);
  }, intervalMs);
}

export function stopMetalSnapshotIngest(): void {
  if (ingestTimer) {
    clearInterval(ingestTimer);
    ingestTimer = null;
  }
}
