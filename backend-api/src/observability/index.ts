import type { Env } from '../config/env.js';
import { initMetricsDefaults } from '../lib/metrics.js';
import { initOtel } from './otel.js';
import { initSentry } from './sentry.js';

export async function initObservability(env: Env): Promise<void> {
  initMetricsDefaults(env);
  initSentry(env);
  await initOtel(env);
}

export { captureException, flushSentry, isSentryEnabled } from './sentry.js';
