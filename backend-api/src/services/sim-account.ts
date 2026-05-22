import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import type { Env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';

type Db = PrismaClient | Prisma.TransactionClient;

export function simStartingCash(env: Env): Prisma.Decimal {
  return new Prisma.Decimal(String(env.SIM_STARTING_CASH_EGP));
}

export async function getOrCreateSimAccount(
  consumerUserId: string,
  env: Env,
  db: Db = prisma,
): Promise<{ id: string; startingCashEgp: Prisma.Decimal; cashEgp: Prisma.Decimal }> {
  const starting = simStartingCash(env);
  const row = await db.simAccount.upsert({
    where: { consumerUserId },
    create: {
      consumerUserId,
      startingCashEgp: starting,
      cashEgp: starting,
    },
    update: {},
    select: { id: true, startingCashEgp: true, cashEgp: true },
  });
  return row;
}

export async function resetSimAccount(
  consumerUserId: string,
  env: Env,
): Promise<{ cashEgp: string; startingCashEgp: string }> {
  const starting = simStartingCash(env);
  const account = await getOrCreateSimAccount(consumerUserId, env);
  await prisma.$transaction([
    prisma.simTrade.deleteMany({ where: { simAccountId: account.id } }),
    prisma.simAccount.update({
      where: { id: account.id },
      data: { cashEgp: starting, startingCashEgp: starting },
    }),
  ]);
  return {
    cashEgp: starting.toString(),
    startingCashEgp: starting.toString(),
  };
}
