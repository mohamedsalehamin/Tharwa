import { describe, expect, it } from 'vitest';
import { isStoryVideoDay } from '../../src/services/social-template-data.js';

describe('isStoryVideoDay', () => {
  it('uses even Cairo day-of-month for video stories', () => {
    expect(isStoryVideoDay('2026-06-19')).toBe(false);
    expect(isStoryVideoDay('2026-06-20')).toBe(true);
  });
});
