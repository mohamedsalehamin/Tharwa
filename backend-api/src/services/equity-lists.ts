import type { Redis } from 'ioredis';
import type { FastifyBaseLogger } from 'fastify';
import {
  EquityListKind,
  EquityListMemberSource,
  InstrumentKind,
  Prisma,
  type EquityList,
} from '@prisma/client';
import type { Env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { getOrFetchJsonCache } from '../lib/redis-cache.js';
import { scanEgyptSymbolsWithSector } from './connectors/tradingview-scanner-egypt.js';
import { listMarketEgxStocksCached, type EquityListRow } from './curated-equities.js';
import {
  aggregateSectorHeatmap,
  type SectorHeatmapCell,
} from './sector-heatmap.js';

const LISTS_TTL_SEC = 300;
const LIST_STOCKS_TTL_SEC = 90;

function listsCacheKey(): string {
  return 'cache:eq:v1:equity-lists:published';
}

function listStocksCacheKey(code: string): string {
  return `cache:eq:v1:equity-list:${code}:stocks`;
}

function heatmapCacheKey(): string {
  return 'cache:eq:v1:equity-lists:heatmap:v1';
}

function parseTvAliases(raw: Prisma.JsonValue | null): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((v): v is string => typeof v === 'string')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function normalizeAliases(aliases: string[]): string[] {
  return aliases.map((a) => a.trim().toLowerCase()).filter((a) => a.length > 0);
}

export type EquityListPublic = {
  id: string;
  code: string;
  titleAr: string;
  titleEn: string;
  descriptionAr: string | null;
  descriptionEn: string | null;
  kind: EquityListKind;
  sortOrder: number;
  memberCount: number;
};

export type EquityListAdmin = EquityListPublic & {
  isPublished: boolean;
  tvAliases: string[];
};

function toPublic(row: EquityList & { _count: { members: number } }): EquityListPublic {
  return {
    id: row.id,
    code: row.code,
    titleAr: row.titleAr,
    titleEn: row.titleEn,
    descriptionAr: row.descriptionAr,
    descriptionEn: row.descriptionEn,
    kind: row.kind,
    sortOrder: row.sortOrder,
    memberCount: row._count.members,
  };
}

function toAdmin(row: EquityList & { _count: { members: number } }): EquityListAdmin {
  return {
    ...toPublic(row),
    isPublished: row.isPublished,
    tvAliases: parseTvAliases(row.tvAliases),
  };
}

const listInclude = {
  _count: { select: { members: true } },
} as const;

export async function listPublishedEquityLists(
  redis: Redis,
  log: FastifyBaseLogger,
): Promise<EquityListPublic[]> {
  const { data } = await getOrFetchJsonCache(
    redis,
    listsCacheKey(),
    LISTS_TTL_SEC,
    log,
    async () => {
      const rows = await prisma.equityList.findMany({
        where: { isPublished: true },
        orderBy: [{ sortOrder: 'asc' }, { titleEn: 'asc' }],
        include: listInclude,
      });
      return rows.map(toPublic);
    },
  );
  return data;
}

export async function listEquityListsAdmin(): Promise<EquityListAdmin[]> {
  const rows = await prisma.equityList.findMany({
    orderBy: [{ sortOrder: 'asc' }, { titleEn: 'asc' }],
    include: listInclude,
  });
  return rows.map(toAdmin);
}

export type EquityListInput = {
  code: string;
  titleAr: string;
  titleEn: string;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
  kind: EquityListKind;
  sortOrder?: number;
  isPublished?: boolean;
  tvAliases?: string[] | null;
};

export async function createEquityList(input: EquityListInput): Promise<EquityListAdmin> {
  const code = input.code.trim().toLowerCase();
  const row = await prisma.equityList.create({
    data: {
      code,
      titleAr: input.titleAr.trim(),
      titleEn: input.titleEn.trim(),
      descriptionAr: input.descriptionAr?.trim() || null,
      descriptionEn: input.descriptionEn?.trim() || null,
      kind: input.kind,
      sortOrder: input.sortOrder ?? 0,
      isPublished: input.isPublished ?? false,
      tvAliases: input.tvAliases ?? undefined,
    },
    include: listInclude,
  });
  return toAdmin(row);
}

export async function updateEquityList(
  id: string,
  input: Partial<EquityListInput>,
): Promise<EquityListAdmin | null> {
  const existing = await prisma.equityList.findUnique({ where: { id } });
  if (!existing) return null;

  const data: Prisma.EquityListUpdateInput = {};
  if (input.code !== undefined) data.code = input.code.trim().toLowerCase();
  if (input.titleAr !== undefined) data.titleAr = input.titleAr.trim();
  if (input.titleEn !== undefined) data.titleEn = input.titleEn.trim();
  if (input.descriptionAr !== undefined) data.descriptionAr = input.descriptionAr?.trim() || null;
  if (input.descriptionEn !== undefined) data.descriptionEn = input.descriptionEn?.trim() || null;
  if (input.kind !== undefined) data.kind = input.kind;
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
  if (input.isPublished !== undefined) data.isPublished = input.isPublished;
  if (input.tvAliases !== undefined) {
    data.tvAliases = input.tvAliases === null ? Prisma.JsonNull : input.tvAliases;
  }

  const row = await prisma.equityList.update({
    where: { id },
    data,
    include: listInclude,
  });
  return toAdmin(row);
}

export async function deleteEquityList(id: string): Promise<boolean> {
  const existing = await prisma.equityList.findUnique({ where: { id } });
  if (!existing) return false;
  await prisma.equityList.delete({ where: { id } });
  return true;
}

export async function getPublishedEquityListByCode(code: string): Promise<EquityListPublic | null> {
  const norm = code.trim().toLowerCase();
  const row = await prisma.equityList.findFirst({
    where: { code: norm, isPublished: true },
    include: listInclude,
  });
  return row ? toPublic(row) : null;
}

export async function listStocksForEquityList(
  env: Env,
  redis: Redis,
  log: FastifyBaseLogger,
  code: string,
): Promise<{ list: EquityListPublic; items: EquityListRow[]; bundleFetchedAt: string } | null> {
  const list = await getPublishedEquityListByCode(code);
  if (!list) return null;

  const { data } = await getOrFetchJsonCache(
    redis,
    listStocksCacheKey(code),
    LIST_STOCKS_TTL_SEC,
    log,
    async () => {
      const members = await prisma.equityListMember.findMany({
        where: { listId: list.id },
        select: { symbol: true },
        orderBy: { symbol: 'asc' },
      });
      const symbolSet = new Set(members.map((m) => m.symbol.trim().toUpperCase()));
      const { items: marketItems, bundleFetchedAt } = await listMarketEgxStocksCached(
        env,
        redis,
        log,
      );
      const bySymbol = new Map(marketItems.map((it) => [it.symbol.trim().toUpperCase(), it]));
      const items: EquityListRow[] = [];
      for (const sym of symbolSet) {
        const hit = bySymbol.get(sym);
        if (hit) items.push(hit);
      }
      items.sort((a, b) => a.symbol.localeCompare(b.symbol));
      return { items, bundleFetchedAt };
    },
  );

  return { list, items: data.items, bundleFetchedAt: data.bundleFetchedAt };
}

export async function getSectorHeatmap(
  env: Env,
  redis: Redis,
  log: FastifyBaseLogger,
): Promise<{ items: SectorHeatmapCell[]; fetchedAt: string }> {
  const { data } = await getOrFetchJsonCache(
    redis,
    heatmapCacheKey(),
    LIST_STOCKS_TTL_SEC,
    log,
    async () => {
      const [lists, market] = await Promise.all([
        prisma.equityList.findMany({
          where: { isPublished: true, kind: EquityListKind.sector },
          orderBy: [{ sortOrder: 'asc' }, { titleEn: 'asc' }],
          include: { members: { select: { symbol: true } } },
        }),
        listMarketEgxStocksCached(env, redis, log),
      ]);
      const quotes = new Map<string, number | null>();
      for (const it of market.items) {
        quotes.set(it.symbol.trim().toUpperCase(), it.changePct);
      }
      const items = aggregateSectorHeatmap(
        lists.map((row) => ({
          code: row.code,
          titleAr: row.titleAr,
          titleEn: row.titleEn,
          sortOrder: row.sortOrder,
          symbols: row.members.map((m) => m.symbol),
        })),
        quotes,
      );
      return { items, fetchedAt: market.bundleFetchedAt };
    },
  );
  return { items: data.items, fetchedAt: data.fetchedAt };
}

export async function setEquityListMembers(
  listId: string,
  symbols: string[],
  source: EquityListMemberSource = EquityListMemberSource.admin,
): Promise<number> {
  const norm = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter((s) => s.length > 0))];
  if (norm.length === 0) return 0;

  const result = await prisma.equityListMember.createMany({
    data: norm.map((symbol) => ({ listId, symbol, source })),
    skipDuplicates: true,
  });
  return result.count;
}

export async function removeEquityListMember(listId: string, symbol: string): Promise<boolean> {
  const norm = symbol.trim().toUpperCase();
  try {
    await prisma.equityListMember.delete({
      where: { listId_symbol: { listId, symbol: norm } },
    });
    return true;
  } catch {
    return false;
  }
}

export type EquityListMemberAdmin = {
  symbol: string;
  source: EquityListMemberSource;
  displayNameAr: string | null;
  displayNameEn: string | null;
};

export async function listEquityListMembersAdmin(listId: string): Promise<EquityListMemberAdmin[]> {
  const members = await prisma.equityListMember.findMany({
    where: { listId },
    orderBy: { symbol: 'asc' },
    select: { symbol: true, source: true },
  });
  if (members.length === 0) return [];

  const codes = members.map((m) => m.symbol.trim().toUpperCase());
  const instruments = await prisma.instrument.findMany({
    where: { kind: InstrumentKind.equity, code: { in: codes } },
    select: { code: true, displayNameAr: true, displayNameEn: true },
  });
  const byCode = new Map(instruments.map((ins) => [ins.code.toUpperCase(), ins]));

  return members.map((m) => {
    const ins = byCode.get(m.symbol.toUpperCase());
    return {
      symbol: m.symbol,
      source: m.source,
      displayNameAr: ins?.displayNameAr?.trim() || null,
      displayNameEn: ins?.displayNameEn?.trim() || null,
    };
  });
}

export type SectorImportResult = {
  scanned: number;
  assigned: number;
  skippedAdmin: number;
  unmatched: number;
};

/** Bootstrap sector list memberships from TradingView scanner (does not overwrite admin rows). */
export async function importSectorMembersFromTradingView(
  log: FastifyBaseLogger,
  signal?: AbortSignal,
): Promise<SectorImportResult> {
  const sectorLists = await prisma.equityList.findMany({
    where: { kind: EquityListKind.sector },
    select: { id: true, tvAliases: true },
  });

  const aliasToListId = new Map<string, string>();
  for (const list of sectorLists) {
    for (const alias of normalizeAliases(parseTvAliases(list.tvAliases))) {
      aliasToListId.set(alias, list.id);
    }
  }

  const scanned = await scanEgyptSymbolsWithSector(signal);
  let assigned = 0;
  let skippedAdmin = 0;
  let unmatched = 0;

  for (const row of scanned) {
    if (!row.sector) {
      unmatched += 1;
      continue;
    }
    const listId = aliasToListId.get(row.sector.trim().toLowerCase());
    if (!listId) {
      unmatched += 1;
      continue;
    }

    const existing = await prisma.equityListMember.findUnique({
      where: { listId_symbol: { listId, symbol: row.symbol } },
    });
    if (existing?.source === EquityListMemberSource.admin) {
      skippedAdmin += 1;
      continue;
    }

    await prisma.equityListMember.upsert({
      where: { listId_symbol: { listId, symbol: row.symbol } },
      create: {
        listId,
        symbol: row.symbol,
        source: EquityListMemberSource.import,
      },
      update: {
        source: EquityListMemberSource.import,
      },
    });
    assigned += 1;
  }

  log.info({ scanned: scanned.length, assigned, skippedAdmin, unmatched }, 'equity sector import done');
  return { scanned: scanned.length, assigned, skippedAdmin, unmatched };
}

export async function invalidateEquityListCaches(redis: Redis): Promise<void> {
  const keys = await redis.keys('cache:eq:v1:equity-list:*');
  const all = [listsCacheKey(), heatmapCacheKey(), ...keys];
  if (all.length > 0) await redis.del(...all);
}
