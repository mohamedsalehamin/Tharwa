import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import type { AppCtx } from '../app-context.js';
import { withRedisLeader } from '../lib/redis-leader.js';
import { cairoDateKey, isEgxTradingDay } from '../services/egx-trading-day.js';
import { getMetaSocialConfig } from '../services/meta-social-credentials.js';
import {
  cairoHourMinute,
  isPastSendTime,
  publishSocialPost,
} from '../services/social-posts.js';
import { getYoutubeSocialConfig } from '../services/youtube-social-credentials.js';
import { getTiktokSocialConfig } from '../services/tiktok-social-credentials.js';
import {
  buildSocialContent,
  wasGoldAlertSentToday,
} from '../services/social-template-data.js';

const LEADER_LOCK_KEY = 'jobs:social-posts:leader';
const holderId = randomUUID();
let socialTimer: ReturnType<typeof setInterval> | null = null;
let tickInFlight = false;

export async function runSocialPostTick(ctx: AppCtx, log: Logger): Promise<void> {
  if (!ctx.env.SOCIAL_POST_ENABLED) return;

  const metaConfig = await getMetaSocialConfig(ctx.env);
  const youtubeConfig = await getYoutubeSocialConfig(ctx.env);
  const tiktokConfig = await getTiktokSocialConfig(ctx.env);
  if (!metaConfig && !youtubeConfig && !tiktokConfig) return;

  const { hour, minute } = cairoHourMinute();
  const day = cairoDateKey();
  const schedules = metaConfig?.schedules ?? {
    goldDaily: { enabled: true, hour: ctx.env.SOCIAL_GOLD_DAILY_HOUR, minute: ctx.env.SOCIAL_GOLD_DAILY_MINUTE },
    egxClose: { enabled: true, hour: ctx.env.SOCIAL_EGX_CLOSE_HOUR, minute: ctx.env.SOCIAL_EGX_CLOSE_MINUTE },
    goldAlert: { enabled: true, dropPct: ctx.env.SOCIAL_GOLD_ALERT_DROP_PCT },
  };

  if (
    schedules.goldDaily.enabled &&
    isPastSendTime(hour, minute, schedules.goldDaily.hour, schedules.goldDaily.minute)
  ) {
    const last = await ctx.redis.get(`jobs:social-posts:last-gold-daily:${day}`);
    if (!last) {
      const result = await publishSocialPost({
        env: ctx.env,
        redis: ctx.redis,
        log,
        template: 'gold_daily',
        triggeredBy: 'schedule',
      });
      if (result) {
        await ctx.redis.set(`jobs:social-posts:last-gold-daily:${day}`, '1', 'EX', 60 * 60 * 48);
        log.info({ day }, 'scheduled gold daily social post attempted');
      }
    }
  }

  if (
    metaConfig &&
    schedules.egxClose.enabled &&
    isPastSendTime(hour, minute, schedules.egxClose.hour, schedules.egxClose.minute)
  ) {
    const tradingDay = await isEgxTradingDay(new Date());
    const last = await ctx.redis.get(`jobs:social-posts:last-egx-close:${day}`);
    if (tradingDay && !last) {
      const result = await publishSocialPost({
        env: ctx.env,
        redis: ctx.redis,
        log,
        template: 'egx_close',
        triggeredBy: 'schedule',
      });
      if (result) {
        await ctx.redis.set(`jobs:social-posts:last-egx-close:${day}`, '1', 'EX', 60 * 60 * 48);
        log.info({ day }, 'scheduled egx close social post attempted');
      }
    }
  }

  if (metaConfig && schedules.goldAlert.enabled) {
    const already = await wasGoldAlertSentToday(ctx.redis, day);
    if (!already) {
      const content = await buildSocialContent(ctx.env, ctx.redis, log, 'gold_alert');
      if (content) {
        const result = await publishSocialPost({
          env: ctx.env,
          redis: ctx.redis,
          log,
          template: 'gold_alert',
          triggeredBy: 'schedule',
        });
        if (result) log.info({ day }, 'gold alert social post attempted');
      }
    }
  }
}

export function startSocialPosts(ctx: AppCtx, log: Logger): void {
  if (!ctx.env.SOCIAL_POST_ENABLED) return;
  if (socialTimer) return;

  const intervalMs = ctx.env.SOCIAL_POST_CHECK_INTERVAL_SEC * 1000;
  socialTimer = setInterval(() => {
    if (tickInFlight) return;
    tickInFlight = true;
    void (async () => {
      try {
        const isLeader = await withRedisLeader(
          ctx.redis,
          LEADER_LOCK_KEY,
          holderId,
          ctx.env.SOCIAL_POST_LEADER_TTL_SEC,
        );
        if (!isLeader) return;
        await runSocialPostTick(ctx, log);
      } catch (e) {
        log.error({ err: e }, 'social post tick failed');
      } finally {
        tickInFlight = false;
      }
    })();
  }, intervalMs);

  log.info({ intervalSec: ctx.env.SOCIAL_POST_CHECK_INTERVAL_SEC }, 'social post scheduler started');
}

export function stopSocialPosts(): void {
  if (socialTimer) clearInterval(socialTimer);
  socialTimer = null;
}
