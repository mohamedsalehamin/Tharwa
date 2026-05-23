import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import type { AppCtx } from '../app-context.js';
import { withRedisLeader } from '../lib/redis-leader.js';
import { syncCorporateCalendarFromMubasher } from '../services/corporate-calendar-sync.js';

const LEADER_LOCK_KEY = 'jobs:corporate-calendar-sync:leader';
const LAST_SUCCESS_DAY_KEY = 'jobs:corporate-calendar-sync:last-success-day';
const FAILED_DAY_KEY = 'jobs:corporate-calendar-sync:failed-day';

const holderId = randomUUID();
let syncTimer: ReturnType<typeof setInterval> | null = null;
let tickInFlight = false;

function cairoDateKey(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
}

async function shouldRunToday(ctx: AppCtx): Promise<boolean> {
  const today = cairoDateKey();
  const lastSuccess = await ctx.redis.get(LAST_SUCCESS_DAY_KEY);
  if (lastSuccess === today) return false;

  const failedDay = await ctx.redis.get(FAILED_DAY_KEY);
  if (failedDay === today) return false;

  return true;
}

async function runSyncTick(ctx: AppCtx, log: Logger): Promise<void> {
  if (tickInFlight) return;

  const isLeader = await withRedisLeader(
    ctx.redis,
    LEADER_LOCK_KEY,
    holderId,
    ctx.env.CORPORATE_CALENDAR_SYNC_LEADER_TTL_SEC,
  );
  if (!isLeader) return;

  if (!(await shouldRunToday(ctx))) return;

  tickInFlight = true;
  const today = cairoDateKey();
  try {
    const result = await syncCorporateCalendarFromMubasher(
      ctx.env.CORPORATE_CALENDAR_SYNC_MAX_RETRIES,
    );
    if (result.success) {
      await ctx.redis.set(LAST_SUCCESS_DAY_KEY, today, 'EX', 60 * 60 * 48);
      await ctx.redis.del(FAILED_DAY_KEY);
      log.info(
        { eventsUpserted: result.eventsUpserted, attemptCount: result.attemptCount },
        'corporate calendar sync ok',
      );
    } else {
      await ctx.redis.set(FAILED_DAY_KEY, today, 'EX', 60 * 60 * 48);
      log.warn(
        { error: result.errorMessage, attemptCount: result.attemptCount },
        'corporate calendar sync failed after retries',
      );
    }
  } catch (e) {
    await ctx.redis.set(FAILED_DAY_KEY, today, 'EX', 60 * 60 * 48);
    log.error({ err: e }, 'corporate calendar sync error');
  } finally {
    tickInFlight = false;
  }
}

export function startCorporateCalendarSync(ctx: AppCtx, log: Logger): void {
  if (!ctx.env.CORPORATE_CALENDAR_SYNC_ENABLED || ctx.env.NODE_ENV === 'test') {
    log.info('corporate calendar sync disabled');
    return;
  }

  const intervalMs = ctx.env.CORPORATE_CALENDAR_SYNC_CHECK_INTERVAL_SEC * 1000;
  log.info(
    {
      holderId,
      checkIntervalSec: ctx.env.CORPORATE_CALENDAR_SYNC_CHECK_INTERVAL_SEC,
      maxRetries: ctx.env.CORPORATE_CALENDAR_SYNC_MAX_RETRIES,
    },
    'corporate calendar sync starting',
  );

  void runSyncTick(ctx, log);
  syncTimer = setInterval(() => {
    void runSyncTick(ctx, log);
  }, intervalMs);
}

export function stopCorporateCalendarSync(): void {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}
