import { UpstreamType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

/** Success within 2× default FX/metals poll interval (90s). */
export const UPSTREAM_HEALTHY_MAX_AGE_SEC = 180;
/** Still acceptable before treating as down. */
export const UPSTREAM_DEGRADED_MAX_AGE_SEC = 600;

export type UpstreamHealthStatus = 'disabled' | 'healthy' | 'degraded' | 'down' | 'unknown';

export function computeUpstreamHealth(row: {
  enabled: boolean;
  lastSuccessAt: Date | null;
  lastError: string | null;
  now?: Date;
}): UpstreamHealthStatus {
  if (!row.enabled) return 'disabled';
  const now = row.now ?? new Date();
  if (row.lastSuccessAt) {
    const ageSec = (now.getTime() - row.lastSuccessAt.getTime()) / 1000;
    if (ageSec <= UPSTREAM_HEALTHY_MAX_AGE_SEC) return 'healthy';
    if (ageSec <= UPSTREAM_DEGRADED_MAX_AGE_SEC) return 'degraded';
    return 'down';
  }
  if (row.lastError) return 'down';
  return 'unknown';
}

export async function recordUpstreamPollResult(
  type: UpstreamType,
  ok: boolean,
  errorMessage?: string,
): Promise<void> {
  await prisma.upstreamConnection.updateMany({
    where: { type },
    data: ok
      ? { lastSuccessAt: new Date(), lastError: null }
      : { lastError: (errorMessage ?? 'Poll failed').slice(0, 4000) },
  });
}
