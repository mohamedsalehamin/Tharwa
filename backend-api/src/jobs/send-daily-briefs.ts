import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import type { AppCtx } from '../app-context.js';
import { withRedisLeader } from '../lib/redis-leader.js';
import { fetchMarketBriefSnapshot, formatMarketBriefMessages } from '../services/daily-brief.js';
import { cairoDateKey, isEgxTradingDay } from '../services/egx-trading-day.js';
import { isFcmConfigured } from '../services/fcm.js';
import { sendLocalizedPush } from '../services/push-devices.js';
import { sendAllWatchlistBriefs } from '../services/watchlist-brief.js';

const LEADER_LOCK_KEY = 'jobs:daily-briefs:leader';
const LAST_SENT_DAY_KEY = 'jobs:daily-briefs:last-sent-day';

const holderId = randomUUID();
let briefTimer: ReturnType<typeof setInterval> | null = null;
let tickInFlight = false;

function cairoHourMinute(): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Cairo',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return { hour, minute };
}

function isPastSendTime(hour: number, minute: number, targetHour: number, targetMinute: number): boolean {
  if (hour > targetHour) return true;
  if (hour === targetHour && minute >= targetMinute) return true;
  return false;
}

async function shouldSendToday(ctx: AppCtx): Promise<boolean> {
  const today = cairoDateKey();
  const lastSent = await ctx.redis.get(LAST_SENT_DAY_KEY);
  if (lastSent === today) return false;

  const { hour, minute } = cairoHourMinute();
  return isPastSendTime(hour, minute, ctx.env.DAILY_BRIEF_HOUR, ctx.env.DAILY_BRIEF_MINUTE);
}

export type DailyBriefTickResult = {
  sent: boolean;
  skippedNonTradingDay?: boolean;
  market?: {
    targetedDeviceCount: number;
    successCount: number;
    failureCount: number;
  };
  watchlist?: {
    usersTargeted: number;
    successCount: number;
    failureCount: number;
  };
};

export async function runDailyBriefTick(ctx: AppCtx, log: Logger): Promise<DailyBriefTickResult> {
  if (!(await isFcmConfigured(ctx.env))) {
    return { sent: false };
  }
  if (!(await shouldSendToday(ctx))) {
    return { sent: false };
  }

  const today = cairoDateKey();
  const tradingDay = await isEgxTradingDay(new Date());

  if (!tradingDay) {
    await ctx.redis.set(LAST_SENT_DAY_KEY, today, 'EX', 60 * 60 * 48);
    log.info({ day: today }, 'daily briefs skipped — EGX non-trading day');
    return { sent: false, skippedNonTradingDay: true };
  }

  const snapshot = await fetchMarketBriefSnapshot(ctx.env, ctx.redis, log);
  const marketMessages = formatMarketBriefMessages(snapshot);
  const market = await sendLocalizedPush(ctx.env, {
    messages: marketMessages,
    data: { type: 'market_brief' },
    notificationType: 'market_brief',
  });

  const watchlist = await sendAllWatchlistBriefs(ctx.env, ctx.redis, log);

  await ctx.redis.set(LAST_SENT_DAY_KEY, today, 'EX', 60 * 60 * 48);

  log.info(
    {
      day: today,
      marketTargeted: market.targetedDeviceCount,
      marketSuccess: market.successCount,
      watchlistUsers: watchlist.usersTargeted,
      watchlistSuccess: watchlist.successCount,
    },
    'daily briefs sent',
  );

  return {
    sent: true,
    market: {
      targetedDeviceCount: market.targetedDeviceCount,
      successCount: market.successCount,
      failureCount: market.failureCount,
    },
    watchlist: {
      usersTargeted: watchlist.usersTargeted,
      successCount: watchlist.successCount,
      failureCount: watchlist.failureCount,
    },
  };
}

async function runTick(ctx: AppCtx, log: Logger): Promise<void> {
  if (tickInFlight) return;

  const isLeader = await withRedisLeader(
    ctx.redis,
    LEADER_LOCK_KEY,
    holderId,
    ctx.env.DAILY_BRIEF_LEADER_TTL_SEC,
  );
  if (!isLeader) return;

  tickInFlight = true;
  try {
    await runDailyBriefTick(ctx, log);
  } catch (e) {
    log.error({ err: e }, 'daily briefs tick error');
  } finally {
    tickInFlight = false;
  }
}

export function startDailyBriefs(ctx: AppCtx, log: Logger): void {
  if (!ctx.env.DAILY_BRIEF_ENABLED || ctx.env.NODE_ENV === 'test') {
    log.info('daily briefs disabled');
    return;
  }

  const intervalMs = ctx.env.DAILY_BRIEF_CHECK_INTERVAL_SEC * 1000;
  log.info(
    {
      holderId,
      checkIntervalSec: ctx.env.DAILY_BRIEF_CHECK_INTERVAL_SEC,
      sendAt: `${ctx.env.DAILY_BRIEF_HOUR}:${String(ctx.env.DAILY_BRIEF_MINUTE).padStart(2, '0')} Africa/Cairo`,
    },
    'daily briefs starting',
  );

  void runTick(ctx, log);
  briefTimer = setInterval(() => {
    void runTick(ctx, log);
  }, intervalMs);
}

export function stopDailyBriefs(): void {
  if (briefTimer) {
    clearInterval(briefTimer);
    briefTimer = null;
  }
}

/** Test helper — reset Redis idempotency key. */
export async function clearDailyBriefSentDay(ctx: AppCtx): Promise<void> {
  await ctx.redis.del(LAST_SENT_DAY_KEY);
}
