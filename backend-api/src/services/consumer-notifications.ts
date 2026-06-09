import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { normalizeBriefLocale, type BriefLocale } from './brief-locale.js';

const INSERT_BATCH = 500;
const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 100;

export type NotificationRowInput = {
  consumerUserId?: string | null;
  installId?: string | null;
  type: string;
  locale: BriefLocale;
  title: string;
  body: string;
};

export async function createConsumerNotifications(rows: NotificationRowInput[]): Promise<void> {
  if (rows.length === 0) return;
  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    const chunk = rows.slice(i, i + INSERT_BATCH);
    await prisma.consumerNotification.createMany({
      data: chunk.map((r) => ({
        consumerUserId: r.consumerUserId ?? null,
        installId: r.installId ?? null,
        type: r.type,
        locale: r.locale,
        title: r.title,
        body: r.body,
      })),
    });
  }
}

export async function createUserLocalizedNotifications(
  consumerUserId: string,
  type: string,
  copies: Record<BriefLocale, { title: string; body: string }>,
): Promise<void> {
  await createConsumerNotifications(
    (['ar', 'en'] as const).map((locale) => ({
      consumerUserId,
      installId: null,
      type,
      locale,
      title: copies[locale].title,
      body: copies[locale].body,
    })),
  );
}

export type ConsumerNotificationDto = {
  id: string;
  type: string;
  title: string;
  body: string;
  createdAt: string;
};

export async function listConsumerNotifications(input: {
  installId: string;
  locale: BriefLocale;
  consumerUserId?: string | null;
  limit?: number;
}): Promise<{ items: ConsumerNotificationDto[] }> {
  const locale = normalizeBriefLocale(input.locale);
  const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIST_LIMIT, 1), MAX_LIST_LIMIT);

  const or: Prisma.ConsumerNotificationWhereInput[] = [
    { installId: input.installId, locale },
  ];
  if (input.consumerUserId) {
    or.push({
      consumerUserId: input.consumerUserId,
      installId: null,
      locale,
    });
  }

  const rows = await prisma.consumerNotification.findMany({
    where: { OR: or },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      type: true,
      title: true,
      body: true,
      createdAt: true,
    },
  });

  return {
    items: rows.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      body: r.body,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}
