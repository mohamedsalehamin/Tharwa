import { describe, expect, it } from 'vitest';
import { fillTemplate } from '../../src/services/social-templates.js';

describe('social-templates', () => {
  it('fills placeholders', () => {
    const out = fillTemplate('Hello {{NAME}} · {{PRICE}}', {
      NAME: 'Tharwa',
      PRICE: '4,120',
    });
    expect(out).toBe('Hello Tharwa · 4,120');
  });
});
