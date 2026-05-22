import { randomUUID } from 'node:crypto';
import type { FastifyBaseLogger } from 'fastify';
import type { Logger } from 'pino';
import type { AppCtx } from '../app-context.js';
import { withRedisLeader } from '../lib/redis-leader.js';
import { getFxRatesCached, getMetalsCached } from '../services/quotes.js';
import { listMarketEgxStocksCached } from '../services/curated-equities.js';
import { getEgxMoversCached } from '../services/stocks.js';
import {
  egxPollIntervalSec,
  getEgxSessionState,
  shouldPollEgxEquities,
} from '../services/session-egx.js';
import { UpstreamType } from '@prisma/client';
import { recordUpstreamPollResult } from '../services/upstream-health.js';

const LEADER_LOCK_KEY = 'jobs:upstream-poller:leader';
const LAST_EGX_POLL_KEY = 'jobs:upstream-poller:last-egx';

let pollTimer: ReturnType<typeof setInterval> | null = null;
let tickInFlight = false;
const holderId = randomUUID();

export type PollTickResult = {
  fx: boolean;
  metals: boolean;
  egx: boolean;
  egxSkipped?: string;
};

/** Warm Redis caches for FX + metals + (conditionally) EGX. */
function asRouteLog(log: Logger): FastifyBaseLogger {
  return log as unknown as FastifyBaseLogger;
}

export async function runUpstreamPollTick(ctx: AppCtx, log: Logger): Promise<PollTickResult> {
  const routeLog = asRouteLog(log);
  const result: PollTickResult = { fx: false, metals: false, egx: false };

  try {
    await getFxRatesCached(ctx.env, ctx.redis, routeLog);
    result.fx = true;
    await recordUpstreamPollResult(UpstreamType.fx, true);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.warn({ err: e }, 'upstream poll: fx failed');
    await recordUpstreamPollResult(UpstreamType.fx, false, msg);
  }

  try {
    await getMetalsCached(ctx.env, ctx.redis, routeLog);
    result.metals = true;
    await recordUpstreamPollResult(UpstreamType.metals, true);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.warn({ err: e }, 'upstream poll: metals failed');
    await recordUpstreamPollResult(UpstreamType.metals, false, msg);
  }

  if (!ctx.env.EQUITIES_TV_ENABLED) {
    result.egxSkipped = 'equities_disabled';
    return result;
  }

  const session = getEgxSessionState();
  if (!shouldPollEgxEquities()) {
    result.egxSkipped = `session_${session}`;
    return result;
  }

  const egxIntervalSec = egxPollIntervalSec(
    session,
    ctx.env.UPSTREAM_POLL_EGX_OPEN_SEC,
    ctx.env.UPSTREAM_POLL_EGX_OFFHOURS_SEC,
  );
  const lastRaw = await ctx.redis.get(LAST_EGX_POLL_KEY);
  if (lastRaw) {
    const lastMs = Number.parseInt(lastRaw, 10);
    if (Number.isFinite(lastMs) && Date.now() - lastMs < egxIntervalSec * 1000) {
      result.egxSkipped = 'interval_not_elapsed';
      return result;
    }
  }

  try {
    await listMarketEgxStocksCached(ctx.env, ctx.redis, routeLog);
    await getEgxMoversCached(ctx.env, ctx.redis, routeLog, {
      list: 'gainers',
      limit: 25,
      offset: 0,
    });
    result.egx = true;
    await recordUpstreamPollResult(UpstreamType.equities, true);
    await ctx.redis.set(LAST_EGX_POLL_KEY, String(Date.now()), 'EX', 86_400);
    log.debug({ session, egxIntervalSec }, 'upstream poll: egx caches refreshed');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.warn({ err: e, session }, 'upstream poll: egx failed');
    await recordUpstreamPollResult(UpstreamType.equities, false, msg);
  }

  return result;
}

async function pollTick(ctx: AppCtx, log: Logger): Promise<void> {
  if (tickInFlight) {
    log.debug('upstream poll: previous tick still running');
    return;
  }

  const isLeader = await withRedisLeader(
    ctx.redis,
    LEADER_LOCK_KEY,
    holderId,
    ctx.env.UPSTREAM_POLL_LEADER_TTL_SEC,
  );
  if (!isLeader) return;

  tickInFlight = true;
  const started = Date.now();
  try {
    const result = await runUpstreamPollTick(ctx, log);
    log.info({ result, durationMs: Date.now() - started }, 'upstream poll tick');
  } catch (e) {
    log.error({ err: e, durationMs: Date.now() - started }, 'upstream poll tick error');
  } finally {
    tickInFlight = false;
  }
}

/**
 * Start background polling (leader-elected via Redis). Safe to call on every replica;
 * only the leader runs each tick.
 */
export function startUpstreamPoller(ctx: AppCtx, log: Logger): void {
  if (!ctx.env.UPSTREAM_POLL_ENABLED || ctx.env.NODE_ENV === 'test') {
    log.info('upstream poller disabled');
    return;
  }

  const intervalMs = ctx.env.UPSTREAM_POLL_INTERVAL_SEC * 1000;
  log.info(
    {
      holderId,
      intervalSec: ctx.env.UPSTREAM_POLL_INTERVAL_SEC,
      egxOpenSec: ctx.env.UPSTREAM_POLL_EGX_OPEN_SEC,
      egxOffHoursSec: ctx.env.UPSTREAM_POLL_EGX_OFFHOURS_SEC,
    },
    'upstream poller starting',
  );

  void pollTick(ctx, log);
  pollTimer = setInterval(() => {
    void pollTick(ctx, log);
  }, intervalMs);
}

export function stopUpstreamPoller(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
