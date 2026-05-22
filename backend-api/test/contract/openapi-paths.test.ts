import { describe, expect, it } from 'vitest';
import SwaggerParser from '@apidevtools/swagger-parser';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OPENAPI_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../specs/001-tharwa-platform-mvp/contracts/openapi.yaml',
);

/** Routes the MVP app must expose (subset aligned with spec). */
const REQUIRED_PATHS = [
  '/v1/fx/rates',
  '/v1/metals',
  '/v1/market/summary',
  '/v1/stocks',
  '/v1/auth/login',
  '/v1/auth/register',
  '/v1/auth/account',
  '/v1/announcements',
  '/v1/watchlist',
  '/v1/portfolio/summary',
  '/v1/zakat/nisab',
  '/v1/zakat/compute',
  '/v1/zakat/prefill',
  '/v1/zakat/methodology',
  '/v1/zakat/sessions',
  '/health',
] as const;

describe('OpenAPI canonical spec', () => {
  it('defines required MVP paths', async () => {
    const doc = await SwaggerParser.validate(OPENAPI_PATH);
    for (const path of REQUIRED_PATHS) {
      expect(doc.paths?.[path], `missing path ${path}`).toBeDefined();
    }
  });
});
