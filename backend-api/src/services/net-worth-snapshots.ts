import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { getFxRatesCached, getMetalsCached } from './quotes.js';
import { buildNetWorthSummary, type NetWorthCtx, type NetWorthSubtotal } from './net-worth.js';

export type NetWorthSnapshotDto = {
  periodMonth: string;
  capturedAt: string;
  totalEgp: number;
  changeFromPrevPct: number | null;
  usdEgpRate: number | null;
  goldGramEgp: number | null;
  inflationIndex: number | null;
};

/** First day of the current month as a UTC date (matches Prisma @db.Date semantics). */
export function currentPeriodMonth(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function decToNum(d: Prisma.Decimal | null): number | null {
  return d == null ? null : Number(d);
}

/** Percentage change of `curr` vs `prev`; null when prev is missing or ~0. */
export function pctChange(curr: number, prev: number | null | undefined): number | null {
  if (prev == null || !Number.isFinite(prev) || Math.abs(prev) <= 1e-9) return null;
  if (!Number.isFinite(curr)) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

async function resolveAnchors(
  ctx: NetWorthCtx,
): Promise<{ usdEgpRate: number | null; goldGramEgp: number | null; inflationIndex: number | null }> {
  const [fx, metals, inflation] = await Promise.all([
    getFxRatesCached(ctx.env, ctx.redis, ctx.log).catch(() => null),
    getMetalsCached(ctx.env, ctx.redis, ctx.log).catch(() => null),
    prisma.inflationBenchmark.findFirst({
      where: { indexValue: { not: null } },
      orderBy: { periodMonth: 'desc' },
      select: { indexValue: true },
    }),
  ]);

  const usd = fx?.items.find((i) => i.baseCurrency.toUpperCase() === 'USD');
  const gold24 = metals?.items.find(
    (i) => i.metal === 'gold' && i.unit === 'gram' && i.karat === 24,
  );

  return {
    usdEgpRate: usd && Number.isFinite(usd.rate) ? usd.rate : null,
    goldGramEgp: gold24 && Number.isFinite(gold24.amountEgp) ? gold24.amountEgp : null,
    inflationIndex: inflation?.indexValue != null ? Number(inflation.indexValue) : null,
  };
}

/** Capture (or update) the snapshot for the given consumer for the current month. Idempotent. */
export async function captureSnapshot(
  consumerUserId: string,
  ctx: NetWorthCtx,
): Promise<NetWorthSnapshotDto> {
  const summary = await buildNetWorthSummary(consumerUserId, ctx);
  const anchors = await resolveAnchors(ctx);
  const periodMonth = currentPeriodMonth();

  const breakdownJson = summary.breakdown as unknown as Prisma.InputJsonValue;
  const freshnessJson = summary.freshness as unknown as Prisma.InputJsonValue;

  const row = await prisma.netWorthSnapshot.upsert({
    where: { consumerUserId_periodMonth: { consumerUserId, periodMonth } },
    update: {
      capturedAt: new Date(),
      totalEgp: summary.totalEgp,
      breakdown: breakdownJson,
      usdEgpRate: anchors.usdEgpRate,
      goldGramEgp: anchors.goldGramEgp,
      inflationIndex: anchors.inflationIndex,
      dataFreshness: freshnessJson,
    },
    create: {
      consumerUserId,
      periodMonth,
      totalEgp: summary.totalEgp,
      breakdown: breakdownJson,
      usdEgpRate: anchors.usdEgpRate,
      goldGramEgp: anchors.goldGramEgp,
      inflationIndex: anchors.inflationIndex,
      dataFreshness: freshnessJson,
    },
  });

  return {
    periodMonth: toDateStr(row.periodMonth),
    capturedAt: row.capturedAt.toISOString(),
    totalEgp: Number(row.totalEgp),
    changeFromPrevPct: null,
    usdEgpRate: decToNum(row.usdEgpRate),
    goldGramEgp: decToNum(row.goldGramEgp),
    inflationIndex: decToNum(row.inflationIndex),
  };
}

/** List snapshots most-recent-first, computing change vs the chronologically previous snapshot. */
export async function listSnapshots(
  consumerUserId: string,
  months: number,
): Promise<NetWorthSnapshotDto[]> {
  const rows = await prisma.netWorthSnapshot.findMany({
    where: { consumerUserId },
    orderBy: { periodMonth: 'desc' },
    take: months,
  });

  return rows.map((row, idx) => {
    const prev = rows[idx + 1]; // older snapshot
    const total = Number(row.totalEgp);
    const changeFromPrevPct = prev ? pctChange(total, Number(prev.totalEgp)) : null;
    return {
      periodMonth: toDateStr(row.periodMonth),
      capturedAt: row.capturedAt.toISOString(),
      totalEgp: total,
      changeFromPrevPct,
      usdEgpRate: decToNum(row.usdEgpRate),
      goldGramEgp: decToNum(row.goldGramEgp),
      inflationIndex: decToNum(row.inflationIndex),
    };
  });
}

export type { NetWorthSubtotal };
