import type { Redis } from 'ioredis';
import type { FastifyBaseLogger } from 'fastify';
import type { Env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { quoteForTvId } from './curated-equities.js';
import { resolveTradingViewSymbol } from './connectors/equities.js';
import type { LocalizedPushMessages } from './brief-locale.js';
import { createUserLocalizedNotifications } from './consumer-notifications.js';
import { sendLocalizedPush } from './push-devices.js';

type WatchlistQuoteRow = {
  code: string;
  changePct: number;
};

function fmtPct(n: number): string {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

export async function buildWatchlistQuotes(
  env: Env,
  redis: Redis,
  log: FastifyBaseLogger,
  consumerUserId: string,
): Promise<WatchlistQuoteRow[]> {
  const items = await prisma.watchlistItem.findMany({
    where: { consumerUserId },
    include: {
      instrument: { select: { code: true, metadata: true } },
    },
  });
  if (items.length === 0) return [];

  const rows: WatchlistQuoteRow[] = [];
  for (const item of items) {
    const tvId = resolveTradingViewSymbol(item.instrument.code, item.instrument.metadata);
    try {
      const q = await quoteForTvId(env, redis, log, tvId);
      if (q.changePct != null && Number.isFinite(q.changePct)) {
        rows.push({ code: item.instrument.code, changePct: q.changePct });
      }
    } catch {
      /* skip instruments without a quote */
    }
  }
  return rows;
}

export function formatWatchlistBriefMessages(rows: WatchlistQuoteRow[]): LocalizedPushMessages | null {
  if (rows.length === 0) return null;

  const avg = rows.reduce((s, r) => s + r.changePct, 0) / rows.length;
  const best = rows.reduce((a, b) => (b.changePct > a.changePct ? b : a));
  const weakest = rows.reduce((a, b) => (b.changePct < a.changePct ? b : a));

  return {
    en: {
      title: 'Watchlist brief',
      body: [
        `Watchlist avg: ${fmtPct(avg)}`,
        `Best: ${best.code} ${fmtPct(best.changePct)}`,
        `Weakest: ${weakest.code} ${fmtPct(weakest.changePct)}`,
      ].join('\n'),
    },
    ar: {
      title: 'ملخص قائمة المتابعة',
      body: [
        `متوسط القائمة: ${fmtPct(avg)}`,
        `الأفضل: ${best.code} ${fmtPct(best.changePct)}`,
        `الأضعف: ${weakest.code} ${fmtPct(weakest.changePct)}`,
      ].join('\n'),
    },
  };
}

export type WatchlistBriefSendResult = {
  usersTargeted: number;
  successCount: number;
  failureCount: number;
  invalidTokensRemoved: number;
};

export async function sendAllWatchlistBriefs(
  env: Env,
  redis: Redis,
  log: FastifyBaseLogger,
): Promise<WatchlistBriefSendResult> {
  const userRows = await prisma.watchlistItem.findMany({
    distinct: ['consumerUserId'],
    select: { consumerUserId: true },
  });

  let usersTargeted = 0;
  let successCount = 0;
  let failureCount = 0;
  let invalidTokensRemoved = 0;

  for (const { consumerUserId } of userRows) {
    const deviceCount = await prisma.pushDevice.count({
      where: { consumerUserId, disabledAt: null },
    });
    if (deviceCount === 0) continue;

    const quotes = await buildWatchlistQuotes(env, redis, log, consumerUserId);
    const messages = formatWatchlistBriefMessages(quotes);
    if (!messages) continue;

    await createUserLocalizedNotifications(consumerUserId, 'watchlist_brief', messages);

    const res = await sendLocalizedPush(env, {
      messages,
      data: { type: 'watchlist_brief' },
      notificationType: 'watchlist_brief',
      where: { consumerUserId, disabledAt: null },
    });
    usersTargeted += 1;
    successCount += res.successCount;
    failureCount += res.failureCount;
    invalidTokensRemoved += res.invalidTokensRemoved;
  }

  return { usersTargeted, successCount, failureCount, invalidTokensRemoved };
}
