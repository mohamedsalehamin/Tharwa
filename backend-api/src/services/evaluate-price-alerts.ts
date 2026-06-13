import { InstrumentKind, type PriceAlertDirection } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import type { Logger } from 'pino';
import type { AppCtx } from '../app-context.js';
import { resolveTradingViewSymbol } from './connectors/equities.js';
import { quoteForTvId } from './curated-equities.js';
import { createUserLocalizedNotifications } from './consumer-notifications.js';
import { isFcmConfigured } from './fcm.js';
import { quotePortfolioLastPrice } from './portfolio-quotes.js';
import { prisma } from '../lib/prisma.js';
import { getMetalsCached } from './quotes.js';
import { sendLocalizedPush } from './push-devices.js';
import type { MetalItem } from './connectors/metals.js';

export function isPriceAlertTriggered(
  direction: PriceAlertDirection,
  threshold: number,
  last: number,
): boolean {
  if (!Number.isFinite(threshold) || !Number.isFinite(last)) return false;
  return direction === 'above' ? last >= threshold : last <= threshold;
}

function formatPrice(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function alertPushCopy(input: {
  code: string;
  direction: PriceAlertDirection;
  threshold: number;
  last: number;
}): Record<'ar' | 'en', { title: string; body: string }> {
  const { code, direction, threshold, last } = input;
  const dirAr = direction === 'above' ? 'تجاوز' : 'انخفض دون';
  const dirEn = direction === 'above' ? 'rose above' : 'fell below';
  return {
    ar: {
      title: 'تنبيه سعر',
      body: `${code} ${dirAr} ${formatPrice(threshold)} ج.م — السعر الحالي ${formatPrice(last)} ج.م`,
    },
    en: {
      title: 'Price alert',
      body: `${code} ${dirEn} ${formatPrice(threshold)} EGP — now ${formatPrice(last)} EGP`,
    },
  };
}

async function quoteInstrument(
  instrument: { code: string; kind: InstrumentKind; metadata: unknown },
  quoteCtx: { env: AppCtx['env']; redis: AppCtx['redis']; log: FastifyBaseLogger },
  metalsItems?: MetalItem[],
): Promise<number | null> {
  if (instrument.kind === InstrumentKind.equity) {
    if (!quoteCtx.env.EQUITIES_TV_ENABLED) return null;
    const tvId = resolveTradingViewSymbol(instrument.code, instrument.metadata);
    const q = await quoteForTvId(quoteCtx.env, quoteCtx.redis, quoteCtx.log, tvId);
    return q.last;
  }
  if (instrument.kind === InstrumentKind.metal) {
    const q = await quotePortfolioLastPrice(instrument, quoteCtx, metalsItems);
    return q.last;
  }
  return null;
}

export type EvaluatePriceAlertsResult = {
  checked: number;
  triggered: number;
  skippedNoQuote: number;
  skippedCooldown: number;
};

/** Evaluate enabled alerts; send push + in-app notification on trigger. */
export async function evaluatePriceAlerts(
  ctx: AppCtx,
  log: Logger,
): Promise<EvaluatePriceAlertsResult> {
  const result: EvaluatePriceAlertsResult = {
    checked: 0,
    triggered: 0,
    skippedNoQuote: 0,
    skippedCooldown: 0,
  };

  const alerts = await prisma.priceAlert.findMany({
    where: { isEnabled: true },
    include: {
      instrument: {
        select: { id: true, code: true, kind: true, metadata: true },
      },
    },
  });

  if (alerts.length === 0) return result;

  const routeLog = log as unknown as FastifyBaseLogger;
  const quoteCtx = { env: ctx.env, redis: ctx.redis, log: routeLog };
  const metalsBundle = await getMetalsCached(ctx.env, ctx.redis, routeLog).catch(() => null);
  const metalsItems = metalsBundle?.items;

  const quoteByInstrument = new Map<string, number | null>();
  const cooldownMs = ctx.env.PRICE_ALERT_COOLDOWN_SEC * 1000;
  const now = Date.now();
  const fcmReady = await isFcmConfigured(ctx.env);

  for (const alert of alerts) {
    result.checked += 1;

    if (
      alert.lastTriggeredAt &&
      now - alert.lastTriggeredAt.getTime() < cooldownMs
    ) {
      result.skippedCooldown += 1;
      continue;
    }

    let last = quoteByInstrument.get(alert.instrumentId);
    if (last === undefined) {
      last = await quoteInstrument(alert.instrument, quoteCtx, metalsItems);
      quoteByInstrument.set(alert.instrumentId, last);
    }

    if (last == null || !Number.isFinite(last)) {
      result.skippedNoQuote += 1;
      continue;
    }

    const threshold = Number(alert.threshold);
    if (!isPriceAlertTriggered(alert.direction, threshold, last)) continue;

    await prisma.priceAlert.update({
      where: { id: alert.id },
      data: { lastTriggeredAt: new Date() },
    });
    result.triggered += 1;

    const copies = alertPushCopy({
      code: alert.instrument.code,
      direction: alert.direction,
      threshold,
      last,
    });

    await createUserLocalizedNotifications(alert.consumerUserId, 'price_alert', copies);

    if (fcmReady) {
      await sendLocalizedPush(ctx.env, {
        messages: copies,
        data: {
          type: 'price_alert',
          instrumentId: alert.instrumentId,
          symbol: alert.instrument.code,
        },
        where: { consumerUserId: alert.consumerUserId },
        notificationType: 'price_alert',
      });
    }
  }

  return result;
}
