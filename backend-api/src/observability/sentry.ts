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
    integrations: [
      // Fastify v5: route-scoped transactions + error capture via diagnostics channel.
      Sentry.fastifyIntegration({
        shouldHandleError(_error, _request, reply) {
          return reply.statusCode >= 500;
        },
      }),
      Sentry.prismaIntegration(),
    ],
  });
  enabled = true;
}

/** Attach per-request tags so Sentry MCP issue search maps cleanly to routes/users. */
export function bindSentryRequestContext(context: {
  requestId: string;
  method: string;
  url: string;
}): void {
  if (!enabled) return;
  const scope = Sentry.getIsolationScope();
  scope.setTag('request_id', context.requestId);
  scope.setTag('http.method', context.method);
  scope.setTag('http.route', context.url.split('?')[0] ?? context.url);
}

/** Attach authenticated consumer identity for user-scoped issue triage in Sentry. */
export function bindSentryConsumerUser(userId: string): void {
  if (!enabled) return;
  Sentry.getIsolationScope().setUser({ id: userId });
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
