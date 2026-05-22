import { connectorRequestDurationSeconds, connectorRequestsTotal } from './metrics.js';

function elapsedSeconds(start: bigint): number {
  return Number(process.hrtime.bigint() - start) / 1e9;
}

export async function observeConnector<T>(
  connector: string,
  operation: string,
  fn: () => Promise<T>,
): Promise<T> {
  const start = process.hrtime.bigint();
  try {
    const result = await fn();
    const outcome = 'success' as const;
    connectorRequestDurationSeconds.observe({ connector, operation, outcome }, elapsedSeconds(start));
    connectorRequestsTotal.inc({ connector, operation, outcome });
    return result;
  } catch (e) {
    const outcome = 'error' as const;
    connectorRequestDurationSeconds.observe({ connector, operation, outcome }, elapsedSeconds(start));
    connectorRequestsTotal.inc({ connector, operation, outcome });
    throw e;
  }
}
