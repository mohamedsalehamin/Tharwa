import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import type { Env } from '../config/env.js';

export const metricsRegistry = new Registry();

collectDefaultMetrics({ register: metricsRegistry, prefix: 'tharwa_' });

export const httpRequestsTotal = new Counter({
  name: 'tharwa_http_requests_total',
  help: 'HTTP requests by method, route template, and status code',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [metricsRegistry],
});

export const httpRequestDurationSeconds = new Histogram({
  name: 'tharwa_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

export const connectorRequestsTotal = new Counter({
  name: 'tharwa_connector_requests_total',
  help: 'Upstream connector calls by connector, operation, and outcome',
  labelNames: ['connector', 'operation', 'outcome'] as const,
  registers: [metricsRegistry],
});

export const connectorRequestDurationSeconds = new Histogram({
  name: 'tharwa_connector_request_duration_seconds',
  help: 'Upstream connector call duration in seconds',
  labelNames: ['connector', 'operation', 'outcome'] as const,
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 20, 30, 60],
  registers: [metricsRegistry],
});

export function initMetricsDefaults(env: Env): void {
  metricsRegistry.setDefaultLabels({
    service: env.SERVICE_NAME,
    environment: env.NODE_ENV,
    build: env.BUILD_SHA,
  });
}

export async function renderMetrics(): Promise<string> {
  return metricsRegistry.metrics();
}

export function metricsContentType(): string {
  return metricsRegistry.contentType;
}
