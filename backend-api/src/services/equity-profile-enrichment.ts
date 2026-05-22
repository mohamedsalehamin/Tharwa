import type { Redis } from 'ioredis';
import type { FastifyBaseLogger } from 'fastify';
import type { Env } from '../config/env.js';
import { logoUrlFromTvLogoid } from '../lib/tv-logo.js';
import {
  scanEgyptRelatedByIndustry,
  scanEgyptSymbolProfile,
  type EgyptScannerProfile,
  type EgyptScannerRelatedRow,
} from './connectors/tradingview-profile-egypt.js';
import type { EquityDetailRow } from './curated-equities.js';

const PROFILE_TTL_SEC = 600;
const RELATED_TTL_SEC = 600;

function ageSec(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 1000;
}

function profileCacheKey(tvId: string): string {
  return `cache:eq:v1:scanner:prof:v5:${tvId}`;
}

function relatedCacheKey(industry: string, excludeSymbol: string): string {
  const ind = industry.length > 100 ? industry.slice(0, 100) : industry;
  return `cache:eq:v1:scanner:rel:${excludeSymbol.toUpperCase()}:${ind}`;
}

async function readJsonCache<T>(redis: Redis, key: string, ttl: number, log: FastifyBaseLogger): Promise<T | null> {
  const raw = await redis.get(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { at: string; data: T };
    if (ageSec(parsed.at) < ttl) return parsed.data;
  } catch (e) {
    log.warn({ e, key }, 'equity scanner cache corrupt');
  }
  return null;
}

async function writeJsonCache<T>(redis: Redis, key: string, data: T, ttlSec: number): Promise<void> {
  const payload = JSON.stringify({ at: new Date().toISOString(), data });
  await redis.set(key, payload, 'EX', ttlSec);
}

export async function enrichEquityDetailWithScanner(
  env: Env,
  redis: Redis,
  log: FastifyBaseLogger,
  row: EquityDetailRow,
  signal?: AbortSignal,
): Promise<EquityDetailRow> {
  if (!env.EQUITIES_TV_ENABLED || !row.tvSymbol) {
    return { ...row, profile: null, relatedStocks: [] };
  }

  const tvId = row.tvSymbol;

  try {
    let profile: EgyptScannerProfile | null = await readJsonCache<EgyptScannerProfile>(
      redis,
      profileCacheKey(tvId),
      PROFILE_TTL_SEC,
      log,
    );
    if (!profile) {
      profile = await scanEgyptSymbolProfile(tvId, signal);
      if (profile) {
        await writeJsonCache(redis, profileCacheKey(tvId), profile, PROFILE_TTL_SEC);
      }
    }

    let related: EgyptScannerRelatedRow[] = [];
    if (profile?.industry) {
      const rk = relatedCacheKey(profile.industry, row.symbol);
      const hit = await readJsonCache<EgyptScannerRelatedRow[]>(redis, rk, RELATED_TTL_SEC, log);
      if (hit) {
        related = hit;
      } else {
        related = await scanEgyptRelatedByIndustry(profile.industry, row.symbol, 8, signal);
        await writeJsonCache(redis, rk, related, RELATED_TTL_SEC);
      }
    }

    const logoUrl = logoUrlFromTvLogoid(profile?.logoid);
    return {
      ...row,
      profile: profile ?? null,
      relatedStocks: related,
      logoUrl: row.logoUrl ?? logoUrl ?? undefined,
    };
  } catch (e) {
    log.warn({ e, tvId }, 'equity scanner enrichment failed');
    return { ...row, profile: null, relatedStocks: [] };
  }
}
