import type { AnnouncementVariant, ConsumerAnnouncement, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

export type AnnouncementPublicItem = {
  id: string;
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
  variant: AnnouncementVariant;
  dismissible: boolean;
  linkUrl: string | null;
};

export type AnnouncementAdminItem = AnnouncementPublicItem & {
  sortOrder: number;
  isEnabled: boolean;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function activeWindowWhere(now: Date): Prisma.ConsumerAnnouncementWhereInput {
  return {
    isEnabled: true,
    AND: [
      { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
      { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
    ],
  };
}

function toPublic(row: ConsumerAnnouncement): AnnouncementPublicItem {
  return {
    id: row.id,
    titleAr: row.titleAr,
    titleEn: row.titleEn,
    bodyAr: row.bodyAr,
    bodyEn: row.bodyEn,
    variant: row.variant,
    dismissible: row.dismissible,
    linkUrl: row.linkUrl,
  };
}

function toAdmin(row: ConsumerAnnouncement): AnnouncementAdminItem {
  return {
    ...toPublic(row),
    sortOrder: row.sortOrder,
    isEnabled: row.isEnabled,
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listActiveAnnouncements(now = new Date()): Promise<AnnouncementPublicItem[]> {
  const rows = await prisma.consumerAnnouncement.findMany({
    where: activeWindowWhere(now),
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  });
  return rows.map(toPublic);
}

export async function listAllAnnouncementsAdmin(): Promise<AnnouncementAdminItem[]> {
  const rows = await prisma.consumerAnnouncement.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  });
  return rows.map(toAdmin);
}

export type CreateAnnouncementInput = {
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
  variant?: AnnouncementVariant;
  sortOrder?: number;
  isEnabled?: boolean;
  dismissible?: boolean;
  linkUrl?: string | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  createdByAdminId?: string;
};

export type UpdateAnnouncementInput = Partial<CreateAnnouncementInput>;

function parseOptionalDate(
  value: string | null | undefined,
  field: string,
): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid ${field}`);
  }
  return d;
}

export function assertAnnouncementSchedule(startsAt: Date | null, endsAt: Date | null): void {
  if (startsAt && endsAt && endsAt < startsAt) {
    throw new Error('endsAt must be on or after startsAt');
  }
}

export async function createAnnouncement(input: CreateAnnouncementInput): Promise<AnnouncementAdminItem> {
  const startsAt = input.startsAt ?? null;
  const endsAt = input.endsAt ?? null;
  assertAnnouncementSchedule(startsAt, endsAt);
  const row = await prisma.consumerAnnouncement.create({
    data: {
      titleAr: input.titleAr,
      titleEn: input.titleEn,
      bodyAr: input.bodyAr,
      bodyEn: input.bodyEn,
      variant: input.variant ?? 'info',
      sortOrder: input.sortOrder ?? 0,
      isEnabled: input.isEnabled ?? true,
      dismissible: input.dismissible ?? true,
      linkUrl: input.linkUrl ?? null,
      startsAt,
      endsAt,
      createdByAdminId: input.createdByAdminId ?? null,
    },
  });
  return toAdmin(row);
}

export async function updateAnnouncement(
  id: string,
  input: UpdateAnnouncementInput,
): Promise<AnnouncementAdminItem | null> {
  const existing = await prisma.consumerAnnouncement.findUnique({ where: { id } });
  if (!existing) return null;

  const startsAt =
    input.startsAt !== undefined ? input.startsAt : (existing.startsAt ?? null);
  const endsAt = input.endsAt !== undefined ? input.endsAt : (existing.endsAt ?? null);
  assertAnnouncementSchedule(startsAt, endsAt);

  const row = await prisma.consumerAnnouncement.update({
    where: { id },
    data: {
      titleAr: input.titleAr,
      titleEn: input.titleEn,
      bodyAr: input.bodyAr,
      bodyEn: input.bodyEn,
      variant: input.variant,
      sortOrder: input.sortOrder,
      isEnabled: input.isEnabled,
      dismissible: input.dismissible,
      linkUrl: input.linkUrl,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
    },
  });
  return toAdmin(row);
}

export async function deleteAnnouncement(id: string): Promise<boolean> {
  const res = await prisma.consumerAnnouncement.deleteMany({ where: { id } });
  return res.count > 0;
}

export { parseOptionalDate };
