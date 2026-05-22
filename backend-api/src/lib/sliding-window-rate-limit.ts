/** In-memory sliding-window limiter (MVP; buckets reset on process restart). */
const buckets = new Map<string, number[]>();

export function allowSlidingWindow(
  bucketKey: string,
  maxPerMinute: number,
  windowMs = 60_000,
): boolean {
  const now = Date.now();
  const arr = (buckets.get(bucketKey) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= maxPerMinute) return false;
  arr.push(now);
  buckets.set(bucketKey, arr);
  return true;
}

/** Test-only: clear all buckets. */
export function clearSlidingWindowBuckets(): void {
  buckets.clear();
}
