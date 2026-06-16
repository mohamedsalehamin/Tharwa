import { describe, expect, it } from 'vitest';
import { fillTemplate, loadSocialTemplateSvg } from '../../src/services/social-templates.js';
import { createTestEnv } from '../helpers/test-env.js';

describe('social-templates', () => {
  it('fills placeholders', () => {
    const out = fillTemplate('Hello {{NAME}} · {{PRICE}}', {
      NAME: 'Tharwa',
      PRICE: '4,120',
    });
    expect(out).toBe('Hello Tharwa · 4,120');
  });

  it('inlines raster logo assets for resvg', async () => {
    const env = createTestEnv();
    const svg = await loadSocialTemplateSvg(env, 'gold_daily');
    expect(svg).toContain('data:image/png;base64,');
    expect(svg).not.toContain('href="tharwa-logo.png"');
  });
});
