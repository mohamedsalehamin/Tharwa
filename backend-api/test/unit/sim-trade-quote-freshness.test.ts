import { describe, expect, it } from 'vitest';
import { isPracticeQuoteFresh } from '../../src/services/sim-trade.js';

describe('isPracticeQuoteFresh', () => {
  const now = Date.parse('2026-08-24T15:00:00.000Z');

  it('treats a just-fetched quote as fresh even if the last bar is old', () => {
    expect(isPracticeQuoteFresh('2026-08-24T14:59:30.000Z', 300, now)).toBe(true);
  });

  it('rejects a fetch older than the max age', () => {
    expect(isPracticeQuoteFresh('2026-08-24T14:50:00.000Z', 300, now)).toBe(false);
  });

  it('rejects an invalid timestamp', () => {
    expect(isPracticeQuoteFresh('not-a-date', 300, now)).toBe(false);
  });
});
