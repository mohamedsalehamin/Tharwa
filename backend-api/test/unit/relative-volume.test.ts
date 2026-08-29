import { describe, expect, it } from 'vitest';
import { relativeVolume } from '../../src/services/relative-volume.js';

describe('relativeVolume', () => {
  it('divides today volume by the average', () => {
    expect(relativeVolume(200, 100)).toBe(2);
    expect(relativeVolume(973_431_240, 397_944_192)).toBe(2.45);
  });

  it('returns null when the average is missing or not positive', () => {
    expect(relativeVolume(100, null)).toBeNull();
    expect(relativeVolume(100, undefined)).toBeNull();
    expect(relativeVolume(100, 0)).toBeNull();
    expect(relativeVolume(100, -5)).toBeNull();
  });

  it('returns null for non-finite today volume', () => {
    expect(relativeVolume(Number.NaN, 10)).toBeNull();
    expect(relativeVolume(-1, 10)).toBeNull();
  });
});
