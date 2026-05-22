import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildTestApp } from '../helpers/build-test-app.js';
import {
  assertMarketSummaryShape,
  assertMetalsListShape,
} from '../helpers/market-response-assertions.js';
import { validateOpenApiResponse } from '../helpers/openapi-validator.js';

vi.mock('../../src/lib/prisma.js', () => ({
  prisma: {
    instrument: { findFirst: vi.fn().mockResolvedValue(null) },
    metalKaratRule: { findMany: vi.fn().mockResolvedValue([]) },
    upstreamConnection: { findFirst: vi.fn().mockResolvedValue(null) },
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
  },
}));

describe('public market HTTP contract', () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  it('GET /v1/fx/rates matches OpenAPI 200 schema', async () => {
    const t = await buildTestApp();
    close = t.close;
    const res = await t.app.inject({ method: 'GET', url: '/v1/fx/rates' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const check = await validateOpenApiResponse('/v1/fx/rates', 'get', '200', body);
    expect(check.valid, check.errors?.join('; ')).toBe(true);
    expect(body.items.length).toBeGreaterThan(0);
  });

  it('GET /v1/metals matches OpenAPI 200 schema', async () => {
    const t = await buildTestApp();
    close = t.close;
    const res = await t.app.inject({ method: 'GET', url: '/v1/metals' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    assertMetalsListShape(body);
  });

  it('GET /v1/market/summary matches OpenAPI 200 schema', async () => {
    const t = await buildTestApp();
    close = t.close;
    const res = await t.app.inject({ method: 'GET', url: '/v1/market/summary' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    assertMarketSummaryShape(body);
    const fxCheck = await validateOpenApiResponse('/v1/fx/rates', 'get', '200', {
      disclaimer: body.disclaimer,
      items: body.fx,
    });
    expect(fxCheck.valid, fxCheck.errors?.join('; ')).toBe(true);
    expect(body.egxSessionState).toBeTruthy();
  });
});
