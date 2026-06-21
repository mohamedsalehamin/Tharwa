import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../helpers/build-test-app.js';

describe('CORS', () => {
  it('reflects an allowed browser origin on public routes', async () => {
    const { app, close } = await buildTestApp({
      CORS_ORIGINS: 'https://thrwa.co,https://admin.thrwa.co',
    });
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/openapi.yaml',
        headers: { origin: 'https://thrwa.co' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('https://thrwa.co');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    } finally {
      await close();
    }
  });

  it('omits allow-origin when the browser origin is not listed', async () => {
    const { app, close } = await buildTestApp({
      CORS_ORIGINS: 'https://thrwa.co',
    });
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/openapi.yaml',
        headers: { origin: 'https://example.com' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    } finally {
      await close();
    }
  });
});
