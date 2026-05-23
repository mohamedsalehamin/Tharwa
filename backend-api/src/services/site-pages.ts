import type { SitePage, SitePageKind } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

export type SitePagePublic = {
  slug: string;
  titleAr: string;
  titleEn: string;
  contentAr: string;
  contentEn: string;
  kind: SitePageKind;
};

export type SitePageAdmin = SitePagePublic & {
  id: string;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
};

function toPublic(row: SitePage): SitePagePublic {
  return {
    slug: row.slug,
    titleAr: row.titleAr,
    titleEn: row.titleEn,
    contentAr: row.contentAr,
    contentEn: row.contentEn,
    kind: row.kind,
  };
}

function toAdmin(row: SitePage): SitePageAdmin {
  return {
    ...toPublic(row),
    id: row.id,
    isPublished: row.isPublished,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function assertValidSlug(slug: string): void {
  if (!SLUG_RE.test(slug)) {
    throw new Error('slug must be lowercase letters, numbers, and hyphens only');
  }
}

export async function getPublishedSitePage(slug: string): Promise<SitePagePublic | null> {
  const row = await prisma.sitePage.findFirst({
    where: { slug, isPublished: true },
  });
  return row ? toPublic(row) : null;
}

export async function listAllSitePagesAdmin(): Promise<SitePageAdmin[]> {
  const rows = await prisma.sitePage.findMany({
    orderBy: [{ slug: 'asc' }],
  });
  return rows.map(toAdmin);
}

export type CreateSitePageInput = {
  slug: string;
  titleAr: string;
  titleEn: string;
  contentAr: string;
  contentEn: string;
  kind?: SitePageKind;
  isPublished?: boolean;
};

export type UpdateSitePageInput = Partial<CreateSitePageInput>;

export async function createSitePage(input: CreateSitePageInput): Promise<SitePageAdmin> {
  assertValidSlug(input.slug);
  const row = await prisma.sitePage.create({
    data: {
      slug: input.slug,
      titleAr: input.titleAr,
      titleEn: input.titleEn,
      contentAr: input.contentAr,
      contentEn: input.contentEn,
      kind: input.kind ?? 'standard',
      isPublished: input.isPublished ?? false,
    },
  });
  return toAdmin(row);
}

export async function updateSitePage(
  id: string,
  input: UpdateSitePageInput,
): Promise<SitePageAdmin | null> {
  const existing = await prisma.sitePage.findUnique({ where: { id } });
  if (!existing) return null;
  if (input.slug !== undefined) assertValidSlug(input.slug);

  const row = await prisma.sitePage.update({
    where: { id },
    data: {
      slug: input.slug,
      titleAr: input.titleAr,
      titleEn: input.titleEn,
      contentAr: input.contentAr,
      contentEn: input.contentEn,
      kind: input.kind,
      isPublished: input.isPublished,
    },
  });
  return toAdmin(row);
}

export async function deleteSitePage(id: string): Promise<boolean> {
  const res = await prisma.sitePage.deleteMany({ where: { id } });
  return res.count > 0;
}
