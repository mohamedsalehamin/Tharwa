import type { MasarResult } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { AppError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import type { MasarProfileInput } from './masar-validation.js';

function mapMasarDbError(e: unknown): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    // Table missing / schema not migrated on a deployed API host.
    if (e.code === 'P2021' || e.code === 'P2022') {
      throw new AppError('UNAVAILABLE', 'Masar is temporarily unavailable', 503);
    }
  }
  throw e;
}

export type MasarProfileDto = {
  id: string;
  archetype: MasarResult['archetype'];
  allocation: {
    equityPct: number;
    fixedIncomePct: number;
    goldPct: number;
  };
  shariaPreferred: boolean;
  answers?: MasarProfileInput['answers'];
  createdAt: string;
  updatedAt: string;
};

export function presentMasarProfile(row: MasarResult): MasarProfileDto {
  return {
    id: row.id,
    archetype: row.archetype,
    allocation: {
      equityPct: row.equityPct,
      fixedIncomePct: row.fixedIncomePct,
      goldPct: row.goldPct,
    },
    shariaPreferred: row.shariaPreferred,
    answers: row.answers as MasarProfileInput['answers'] | undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getMasarProfile(consumerUserId: string): Promise<MasarResult | null> {
  try {
    return await prisma.masarResult.findUnique({ where: { consumerUserId } });
  } catch (e) {
    mapMasarDbError(e);
  }
}

export async function saveMasarProfile(
  consumerUserId: string,
  input: MasarProfileInput,
): Promise<MasarResult> {
  const { archetype, allocation, shariaPreferred, answers } = input;
  try {
    return await prisma.masarResult.upsert({
      where: { consumerUserId },
      update: {
        archetype,
        equityPct: allocation.equityPct,
        fixedIncomePct: allocation.fixedIncomePct,
        goldPct: allocation.goldPct,
        shariaPreferred: shariaPreferred ?? false,
        answers: answers ?? undefined,
      },
      create: {
        consumerUserId,
        archetype,
        equityPct: allocation.equityPct,
        fixedIncomePct: allocation.fixedIncomePct,
        goldPct: allocation.goldPct,
        shariaPreferred: shariaPreferred ?? false,
        answers: answers ?? undefined,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
      throw new AppError('UNAUTHORIZED', 'Invalid or expired token', 401);
    }
    throw e;
  }
}

export async function deleteMasarProfile(consumerUserId: string): Promise<void> {
  await prisma.masarResult.deleteMany({ where: { consumerUserId } });
}
