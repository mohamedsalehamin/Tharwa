import { OhlcvResolution, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import type { HistoryRange } from './connectors/equities.js';

export function historyRangeToOhlcvResolution(range: HistoryRange): OhlcvResolution {
  switch (range) {
    case '1d':
      return OhlcvResolution.d1;
    case '1w':
      return OhlcvResolution.w1;
    case '1m':
      return OhlcvResolution.m1;
    case '1y':
    default:
      return OhlcvResolution.y1;
  }
}

export type OhlcvBarInput = {
  barTime: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
};

export async function upsertOhlcvBars(
  instrumentId: string,
  resolution: OhlcvResolution,
  bars: OhlcvBarInput[],
  source = 'tradingview',
): Promise<number> {
  if (bars.length === 0) return 0;
  let count = 0;
  for (const bar of bars) {
    await prisma.ohlcvBar.upsert({
      where: {
        instrumentId_resolution_barTime: {
          instrumentId,
          resolution,
          barTime: bar.barTime,
        },
      },
      create: {
        instrumentId,
        resolution,
        barTime: bar.barTime,
        open: new Prisma.Decimal(bar.open),
        high: new Prisma.Decimal(bar.high),
        low: new Prisma.Decimal(bar.low),
        close: new Prisma.Decimal(bar.close),
        volume: bar.volume != null && Number.isFinite(bar.volume) ? BigInt(Math.round(bar.volume)) : null,
        source,
      },
      update: {
        open: new Prisma.Decimal(bar.open),
        high: new Prisma.Decimal(bar.high),
        low: new Prisma.Decimal(bar.low),
        close: new Prisma.Decimal(bar.close),
        volume: bar.volume != null && Number.isFinite(bar.volume) ? BigInt(Math.round(bar.volume)) : null,
        source,
      },
    });
    count += 1;
  }
  return count;
}

export async function listOhlcvBars(
  instrumentId: string,
  resolution: OhlcvResolution,
  limit = 500,
): Promise<
  Array<{
    barTime: Date;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number | null;
  }>
> {
  const rows = await prisma.ohlcvBar.findMany({
    where: { instrumentId, resolution },
    orderBy: { barTime: 'asc' },
    take: limit,
  });
  return rows.map((r) => ({
    barTime: r.barTime,
    open: Number(r.open),
    high: Number(r.high),
    low: Number(r.low),
    close: Number(r.close),
    volume: r.volume != null ? Number(r.volume) : null,
  }));
}

/** Unix seconds (TradingView) → bar open time. */
export function tvTimeToBarDate(unixSec: number): Date {
  return new Date(unixSec * 1000);
}
