import { Prisma } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import type { Redis } from 'ioredis';
import type { Env } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { computeZakat, loadZakatNisab, type ZakatComputeInput, type ZakatComputeResult } from './zakat.js';
import { getMetalsCached } from './quotes.js';

export type ZakatSessionSummary = {
  id: string;
  label: string | null;
  yearType: string;
  nisabAttainmentDate: string | null;
  zakatDueEgp: number;
  aboveNisab: boolean;
  createdAt: string;
};

export async function listZakatSessions(consumerUserId: string): Promise<{ items: ZakatSessionSummary[] }> {
  const rows = await prisma.zakatSession.findMany({
    where: { consumerUserId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      label: true,
      yearType: true,
      nisabAttainmentDate: true,
      zakatDueEgp: true,
      result: true,
      createdAt: true,
    },
  });

  const items: ZakatSessionSummary[] = rows.map((r) => {
    const result = r.result as { aboveNisab?: boolean };
    return {
      id: r.id,
      label: r.label,
      yearType: r.yearType,
      nisabAttainmentDate: r.nisabAttainmentDate
        ? r.nisabAttainmentDate.toISOString().slice(0, 10)
        : null,
      zakatDueEgp: new Prisma.Decimal(r.zakatDueEgp).toNumber(),
      aboveNisab: Boolean(result.aboveNisab),
      createdAt: r.createdAt.toISOString(),
    };
  });

  return { items };
}

export async function getZakatSession(
  consumerUserId: string,
  sessionId: string,
): Promise<{
  id: string;
  label: string | null;
  inputs: unknown;
  result: unknown;
  createdAt: string;
}> {
  const row = await prisma.zakatSession.findFirst({
    where: { id: sessionId, consumerUserId },
  });
  if (!row) {
    throw new AppError('NOT_FOUND', 'Zakat session not found', 404);
  }
  return {
    id: row.id,
    label: row.label,
    inputs: row.inputs,
    result: row.result,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function createZakatSession(
  consumerUserId: string,
  label: string | null | undefined,
  inputs: ZakatComputeInput,
  env: Env,
  redis: Redis,
  log: FastifyBaseLogger,
): Promise<{ session: ZakatSessionSummary; result: ZakatComputeResult }> {
  const [nisab, metals] = await Promise.all([
    loadZakatNisab(env, redis, log),
    getMetalsCached(env, redis, log),
  ]);
  const result = computeZakat(inputs, metals.items, nisab);

  const row = await prisma.zakatSession.create({
    data: {
      consumerUserId,
      label: label?.trim() || null,
      yearType: inputs.yearType,
      nisabAttainmentDate: inputs.nisabAttainmentDate
        ? new Date(`${inputs.nisabAttainmentDate}T00:00:00.000Z`)
        : null,
      inputs: inputs as unknown as Prisma.InputJsonValue,
      result: result as unknown as Prisma.InputJsonValue,
      zakatDueEgp: result.zakatDueEgp,
    },
  });

  return {
    session: {
      id: row.id,
      label: row.label,
      yearType: row.yearType,
      nisabAttainmentDate: inputs.nisabAttainmentDate ?? null,
      zakatDueEgp: result.zakatDueEgp,
      aboveNisab: result.aboveNisab,
      createdAt: row.createdAt.toISOString(),
    },
    result,
  };
}

export async function deleteZakatSession(consumerUserId: string, sessionId: string): Promise<void> {
  const row = await prisma.zakatSession.findFirst({
    where: { id: sessionId, consumerUserId },
    select: { id: true },
  });
  if (!row) {
    throw new AppError('NOT_FOUND', 'Zakat session not found', 404);
  }
  await prisma.zakatSession.delete({ where: { id: sessionId } });
}
