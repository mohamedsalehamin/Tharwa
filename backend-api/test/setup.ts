import { beforeEach } from 'vitest';
import { clearSlidingWindowBuckets } from '../src/lib/sliding-window-rate-limit.js';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgresql://test:test@127.0.0.1:5432/tharwa_test';
process.env.REDIS_URL ??= 'redis://127.0.0.1:6379';
process.env.FX_MOCK_JSON ??= JSON.stringify([
  {
    baseCurrency: 'USD',
    quoteCurrency: 'EGP',
    rate: 50.1234,
    changePct: 0.12,
    asOf: '2026-05-19T10:00:00.000Z',
    quoteCategory: 'official',
    sessionState: 'open',
    isStale: false,
  },
]);
process.env.METALS_MOCK_JSON ??= JSON.stringify({
  gold24PerGramEgp: 5200,
  silverGramEgp: 85,
});
process.env.EQUITIES_TV_ENABLED ??= 'false';
process.env.UPSTREAM_POLL_ENABLED ??= 'false';
process.env.SECRETS_BACKEND ??= 'env';

beforeEach(() => {
  clearSlidingWindowBuckets();
});
