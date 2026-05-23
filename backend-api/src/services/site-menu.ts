import type { SiteMenuItem, SiteMenuLinkType, SiteMenuPlacement } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

export type SiteMenuItemPublic = {
  id: string;
  labelAr: string;
  labelEn: string;
  href: string;
};

export type SiteMenuItemAdmin = {
  id: string;
  placement: SiteMenuPlacement;
  labelAr: string;
  labelEn: string;
  linkType: SiteMenuLinkType;
  pageId: string | null;
  pageSlug: string | null;
  externalUrl: string | null;
  sortOrder: number;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

type MenuRow = SiteMenuItem & {
  page: { slug: string; isPublished: boolean } | null;
};

function resolveHref(row: MenuRow, publishedOnly: boolean): string | null {
  if (row.linkType === 'external') {
    return row.externalUrl;
  }
  if (row.page && (!publishedOnly || row.page.isPublished)) {
    return `/${row.page.slug}`;
  }
  return null;
}

function toPublic(row: MenuRow): SiteMenuItemPublic | null {
  const href = resolveHref(row, true);
  if (!href) return null;
  return {
    id: row.id,
    labelAr: row.labelAr,
    labelEn: row.labelEn,
    href,
  };
}

function toAdmin(row: MenuRow): SiteMenuItemAdmin {
  return {
    id: row.id,
    placement: row.placement,
    labelAr: row.labelAr,
    labelEn: row.labelEn,
    linkType: row.linkType,
    pageId: row.pageId,
    pageSlug: row.page?.slug ?? null,
    externalUrl: row.externalUrl,
    sortOrder: row.sortOrder,
    isEnabled: row.isEnabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const menuInclude = { page: { select: { slug: true, isPublished: true } } } as const;

export async function getPublicNavigation(): Promise<{
  header: SiteMenuItemPublic[];
  footer: SiteMenuItemPublic[];
}> {
  const rows = await prisma.siteMenuItem.findMany({
    where: { isEnabled: true },
    include: menuInclude,
    orderBy: [{ placement: 'asc' }, { sortOrder: 'asc' }],
  });

  const header: SiteMenuItemPublic[] = [];
  const footer: SiteMenuItemPublic[] = [];

  for (const row of rows) {
    const item = toPublic(row);
    if (!item) continue;
    if (row.placement === 'header') header.push(item);
    else footer.push(item);
  }

  return { header, footer };
}

export async function listAllSiteMenuItemsAdmin(): Promise<SiteMenuItemAdmin[]> {
  const rows = await prisma.siteMenuItem.findMany({
    include: menuInclude,
    orderBy: [{ placement: 'asc' }, { sortOrder: 'asc' }],
  });
  return rows.map(toAdmin);
}

export type CreateSiteMenuItemInput = {
  placement: SiteMenuPlacement;
  labelAr: string;
  labelEn: string;
  linkType: SiteMenuLinkType;
  pageId?: string | null;
  externalUrl?: string | null;
  sortOrder?: number;
  isEnabled?: boolean;
};

export type UpdateSiteMenuItemInput = Partial<CreateSiteMenuItemInput>;

function assertLinkFields(linkType: SiteMenuLinkType, pageId: string | null, externalUrl: string | null): void {
  if (linkType === 'page' && !pageId) {
    throw new Error('pageId is required when linkType is page');
  }
  if (linkType === 'external' && !externalUrl) {
    throw new Error('externalUrl is required when linkType is external');
  }
}

export async function createSiteMenuItem(input: CreateSiteMenuItemInput): Promise<SiteMenuItemAdmin> {
  const pageId = input.pageId ?? null;
  const externalUrl = input.externalUrl ?? null;
  assertLinkFields(input.linkType, pageId, externalUrl);

  const row = await prisma.siteMenuItem.create({
    data: {
      placement: input.placement,
      labelAr: input.labelAr,
      labelEn: input.labelEn,
      linkType: input.linkType,
      pageId: input.linkType === 'page' ? pageId : null,
      externalUrl: input.linkType === 'external' ? externalUrl : null,
      sortOrder: input.sortOrder ?? 0,
      isEnabled: input.isEnabled ?? true,
    },
    include: menuInclude,
  });
  return toAdmin(row);
}

export async function updateSiteMenuItem(
  id: string,
  input: UpdateSiteMenuItemInput,
): Promise<SiteMenuItemAdmin | null> {
  const existing = await prisma.siteMenuItem.findUnique({ where: { id }, include: menuInclude });
  if (!existing) return null;

  const linkType = input.linkType ?? existing.linkType;
  const pageId = input.pageId !== undefined ? input.pageId : existing.pageId;
  const externalUrl = input.externalUrl !== undefined ? input.externalUrl : existing.externalUrl;
  assertLinkFields(linkType, pageId, externalUrl);

  const row = await prisma.siteMenuItem.update({
    where: { id },
    data: {
      placement: input.placement,
      labelAr: input.labelAr,
      labelEn: input.labelEn,
      linkType: input.linkType,
      pageId: linkType === 'page' ? pageId : null,
      externalUrl: linkType === 'external' ? externalUrl : null,
      sortOrder: input.sortOrder,
      isEnabled: input.isEnabled,
    },
    include: menuInclude,
  });
  return toAdmin(row);
}

export async function deleteSiteMenuItem(id: string): Promise<boolean> {
  const res = await prisma.siteMenuItem.deleteMany({ where: { id } });
  return res.count > 0;
}
