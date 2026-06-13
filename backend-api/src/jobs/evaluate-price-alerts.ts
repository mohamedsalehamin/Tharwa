import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import type { AppCtx } from '../app-context.js';
import { withRedisLeader } from '../lib/redis-leader.js';
import {
  evaluatePriceAlerts,
  type EvaluatePriceAlertsResult,
} from '../services/evaluate-price-alerts.js';

const LEADER_LOCK_KEY = 'jobs:price-alerts:leader';

const holderId = randomUUID();
let timer: ReturnType<typeof setInterval> | null = null;
let tickInFlight = false;

export async function runPriceAlertTick(
  ctx: AppCtx,
  log: Logger,
): Promise<EvaluatePriceAlertsResult> {
  return evaluatePriceAlerts(ctx, log);
}

async function runTick(ctx: AppCtx, log: Logger): Promise<void> {
  if (tickInFlight) return;
  const isLeader = await withRedisLeader(
    ctx.redis,
    LEADER_LOCK_KEY,
    holderId,
    ctx.env.PRICE_ALERT_EVAL_LEADER_TTL_SEC,
  );
  if (!isLeader) return;

  tickInFlight = true;
  try {
    const res = await runPriceAlertTick(ctx, log);
    if (res.triggered > 0) {
      log.info(res, 'price alerts evaluated');
    }
  } catch (e) {
    log.error({ err: e }, 'price alert eval tick error');
  } finally {
    tickInFlight = false;
  }
}

export function startPriceAlertEvaluator(ctx: AppCtx, log: Logger): void {
  if (!ctx.env.PRICE_ALERT_EVAL_ENABLED || ctx.env.NODE_ENV === 'test') {
    log.info('price alert evaluator disabled');
    return;
  }
  const intervalMs = ctx.env.PRICE_ALERT_EVAL_INTERVAL_SEC * 1000;
  log.info(
    { holderId, intervalSec: ctx.env.PRICE_ALERT_EVAL_INTERVAL_SEC },
    'price alert evaluator starting',
  );
  void runTick(ctx, log);
  timer = setInterval(() => {
    void runTick(ctx, log);
  }, intervalMs);
}

export function stopPriceAlertEvaluator(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
