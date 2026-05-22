import type { Env } from '../config/env.js';

let started = false;

/** Starts OpenTelemetry when `OTEL_EXPORTER_OTLP_ENDPOINT` is configured. */
export async function initOtel(env: Env): Promise<void> {
  if (started || !env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim()) return;
  if (env.NODE_ENV === 'test') return;

  const endpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT.trim();
  const [{ NodeSDK }, { getNodeAutoInstrumentations }, { OTLPTraceExporter }] = await Promise.all([
    import('@opentelemetry/sdk-node'),
    import('@opentelemetry/auto-instrumentations-node'),
    import('@opentelemetry/exporter-trace-otlp-http'),
  ]);

  const sdk = new NodeSDK({
    serviceName: env.SERVICE_NAME,
    traceExporter: new OTLPTraceExporter({ url: endpoint }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  await sdk.start();
  started = true;

  const shutdown = async () => {
    await sdk.shutdown().catch(() => undefined);
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
