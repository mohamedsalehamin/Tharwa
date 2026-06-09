import type { Redis } from 'ioredis';
import type { FastifyBaseLogger } from 'fastify';
import type { Env } from '../config/env.js';
import { getFxRatesCached } from './quotes.js';
import { getEgyptIndicesWithQuotesCached, getEgxMoversCached } from './stocks.js';
import type { BriefLocale, LocalizedPushMessages } from './brief-locale.js';

export type MarketBriefSnapshot = {
  egx30: { value: number; changePct: number } | null;
  topGainer: { symbol: string; changePct: number } | null;
  topLoser: { symbol: string; changePct: number } | null;
  usdEgp: { rate: number; changePct: number | null } | null;
  dataAvailable: boolean;
};

function fmtNum(n: number, decimals = 2): string {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtPct(n: number): string {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}

function fmtSignedPct(n: number): string {
  return `(${fmtPct(n)})`;
}

export async function fetchMarketBriefSnapshot(
  env: Env,
  redis: Redis,
  log: FastifyBaseLogger,
): Promise<MarketBriefSnapshot> {
  const [indices, gainers, losers, fx] = await Promise.all([
    getEgyptIndicesWithQuotesCached(env, redis, log, { limit: 50, offset: 0 }),
    getEgxMoversCached(env, redis, log, { list: 'gainers', limit: 1, offset: 0 }),
    getEgxMoversCached(env, redis, log, { list: 'losers', limit: 1, offset: 0 }),
    getFxRatesCached(env, redis, log),
  ]);

  const egx30Row = indices.items.find(
    (i) => i.symbol.toUpperCase() === 'EGX30' || i.id.toUpperCase().includes('EGX30'),
  );
  const egx30 =
    egx30Row?.last != null && egx30Row.changePct != null
      ? { value: egx30Row.last, changePct: egx30Row.changePct }
      : null;

  const gainer = gainers.items[0];
  const topGainer =
    gainer && Number.isFinite(gainer.changePct)
      ? { symbol: gainer.symbol, changePct: gainer.changePct }
      : null;

  const loser = losers.items[0];
  const topLoser =
    loser && Number.isFinite(loser.changePct)
      ? { symbol: loser.symbol, changePct: loser.changePct }
      : null;

  const usd = fx.items.find((i) => i.baseCurrency === 'USD');
  const usdEgp =
    usd && Number.isFinite(usd.rate)
      ? { rate: usd.rate, changePct: usd.changePct ?? null }
      : null;

  const dataAvailable = egx30 != null || topGainer != null || topLoser != null || usdEgp != null;

  return { egx30, topGainer, topLoser, usdEgp, dataAvailable };
}

export function formatMarketBriefMessages(snap: MarketBriefSnapshot): LocalizedPushMessages {
  if (!snap.dataAvailable) {
    return {
      en: {
        title: 'Daily market brief',
        body: 'Market data is not available yet. Open Tharwa to refresh the latest prices.',
      },
      ar: {
        title: 'ملخص السوق اليومي',
        body: 'بيانات السوق غير متاحة بعد. افتح ثروة لتحديث أحدث الأسعار.',
      },
    };
  }

  return {
    en: {
      title: 'Daily market brief',
      body: buildMarketBriefBody('en', snap),
    },
    ar: {
      title: 'ملخص السوق اليومي',
      body: buildMarketBriefBody('ar', snap),
    },
  };
}

function buildMarketBriefBody(locale: BriefLocale, snap: MarketBriefSnapshot): string {
  const lines: string[] = [];

  if (snap.egx30) {
    const label = locale === 'ar' ? 'EGX 30' : 'EGX 30';
    lines.push(
      `${label}: ${fmtNum(snap.egx30.value)} ${fmtSignedPct(snap.egx30.changePct)}`,
    );
  }
  if (snap.topGainer) {
    const label = locale === 'ar' ? 'أعلى رابح' : 'Top gainer';
    lines.push(`${label}: ${snap.topGainer.symbol} ${fmtPct(snap.topGainer.changePct)}`);
  }
  if (snap.topLoser) {
    const label = locale === 'ar' ? 'أعلى خاسر' : 'Top loser';
    lines.push(`${label}: ${snap.topLoser.symbol} ${fmtPct(snap.topLoser.changePct)}`);
  }
  if (snap.usdEgp) {
    const pct =
      snap.usdEgp.changePct != null ? ` ${fmtSignedPct(snap.usdEgp.changePct)}` : '';
    lines.push(`USD/EGP: ${fmtNum(snap.usdEgp.rate, 2)}${pct}`);
  }

  return lines.join('\n');
}
