import { PriceAlertDirection, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

export type CreatePriceAlertInput = {
  instrumentId: string;
  direction: PriceAlertDirection;
  threshold: number;
};

export async function listPriceAlertsForUser(consumerUserId: string) {
  return prisma.priceAlert.findMany({
    where: { consumerUserId },
    orderBy: { createdAt: 'desc' },
    include: {
      instrument: {
        select: { id: true, code: true, kind: true, displayNameAr: true, displayNameEn: true },
      },
    },
  });
}

export async function createPriceAlert(consumerUserId: string, input: CreatePriceAlertInput) {
  return prisma.priceAlert.create({
    data: {
      consumerUserId,
      instrumentId: input.instrumentId,
      direction: input.direction,
      threshold: new Prisma.Decimal(input.threshold),
    },
    include: {
      instrument: {
        select: { id: true, code: true, kind: true, displayNameAr: true, displayNameEn: true },
      },
    },
  });
}

export async function updatePriceAlert(
  consumerUserId: string,
  alertId: string,
  patch: { threshold?: number; direction?: PriceAlertDirection; isEnabled?: boolean },
) {
  const existing = await prisma.priceAlert.findFirst({
    where: { id: alertId, consumerUserId },
  });
  if (!existing) return null;
  return prisma.priceAlert.update({
    where: { id: alertId },
    data: {
      ...(patch.threshold !== undefined ? { threshold: new Prisma.Decimal(patch.threshold) } : {}),
      ...(patch.direction !== undefined ? { direction: patch.direction } : {}),
      ...(patch.isEnabled !== undefined ? { isEnabled: patch.isEnabled } : {}),
    },
    include: {
      instrument: {
        select: { id: true, code: true, kind: true, displayNameAr: true, displayNameEn: true },
      },
    },
  });
}

export async function deletePriceAlert(consumerUserId: string, alertId: string): Promise<boolean> {
  const res = await prisma.priceAlert.deleteMany({
    where: { id: alertId, consumerUserId },
  });
  return res.count > 0;
}
