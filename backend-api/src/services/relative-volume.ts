/** Today’s volume divided by a trailing average. Null when the average is unusable. */
export function relativeVolume(
  today: number,
  average: number | null | undefined,
): number | null {
  if (average == null || !Number.isFinite(average) || average <= 0) return null;
  if (!Number.isFinite(today) || today < 0) return null;
  return Math.round((today / average) * 100) / 100;
}
