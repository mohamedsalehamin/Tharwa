import { allowSlidingWindow } from '../lib/sliding-window-rate-limit.js';

/** Sliding-window limiter for `/v1/auth/*` (bucket key should include route, e.g. `reg:${ip}`). */
export function allowAuthRateLimit(bucketKey: string, maxPerMinute = 40): boolean {
  return allowSlidingWindow(`auth:${bucketKey}`, maxPerMinute);
}
