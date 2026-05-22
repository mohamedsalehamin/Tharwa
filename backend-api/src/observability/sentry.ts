import * as Sentry from '@sentry/node';
import type { Env } from '../config/env.js';

let enabled = false;

export function initSentry(env: Env): void {
  if (!env.SENTRY_DSN?.trim()) return;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    release: env.BUILD_SHA !== 'dev' ? env.BUILD_SHA : undefined,
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
    enabled: env.NODE_ENV !== 'test',
  });
  enabled = true;
}

export function isSentryEnabled(): boolean {
  return enabled;
}

export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (!enabled) return;
  Sentry.withScope((scope) => {
    if (context) scope.setContext('extra', context);
    Sentry.captureException(error);
  });
}

export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (!enabled) return;
  await Sentry.flush(timeoutMs);
}
