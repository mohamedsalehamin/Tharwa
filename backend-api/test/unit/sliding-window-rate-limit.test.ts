import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  allowSlidingWindow,
  clearSlidingWindowBuckets,
} from '../../src/lib/sliding-window-rate-limit.js';

describe('allowSlidingWindow', () => {
  afterEach(() => {
    clearSlidingWindowBuckets();
    vi.useRealTimers();
  });

  it('allows up to maxPerMinute within the window', () => {
    const key = 'test-ip';
    expect(allowSlidingWindow(key, 3)).toBe(true);
    expect(allowSlidingWindow(key, 3)).toBe(true);
    expect(allowSlidingWindow(key, 3)).toBe(true);
    expect(allowSlidingWindow(key, 3)).toBe(false);
  });

  it('resets after the window elapses', () => {
    vi.useFakeTimers();
    const key = 'rolling';
    expect(allowSlidingWindow(key, 1, 1000)).toBe(true);
    expect(allowSlidingWindow(key, 1, 1000)).toBe(false);
    vi.advanceTimersByTime(1001);
    expect(allowSlidingWindow(key, 1, 1000)).toBe(true);
  });
});
