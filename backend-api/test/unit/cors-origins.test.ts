import { describe, expect, it } from 'vitest';
import { createTestEnv } from '../helpers/test-env.js';
import { resolveCorsOrigins } from '../../src/lib/cors-origins.js';

describe('resolveCorsOrigins', () => {
  it('includes ADMIN_PUBLIC_ORIGIN when missing from CORS_ORIGINS', () => {
    const env = createTestEnv({
      CORS_ORIGINS: 'https://thrwa.co',
      ADMIN_PUBLIC_ORIGIN: 'https://admin.thrwa.co',
    });
    expect(resolveCorsOrigins(env)).toEqual([
      'https://thrwa.co',
      'https://admin.thrwa.co',
    ]);
  });
});
