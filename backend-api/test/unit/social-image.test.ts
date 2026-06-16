import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fillTemplate, loadSocialTemplateSvg } from '../../src/services/social-templates.js';
import { renderSvgToPng } from '../../src/services/social-image.js';
import { createTestEnv } from '../helpers/test-env.js';

describe('social-image', () => {
  it('renders Arabic template text into PNG using bundled Cairo fonts', async () => {
    const env = createTestEnv();
    const svgTemplate = await loadSocialTemplateSvg(env, 'gold_daily');
    const svg = fillTemplate(svgTemplate, {
      DATE_AR: 'الثلاثاء 16 يونيو 2025',
      CHANGE_HEADLINE: 'ارتفاع 30 ج منذ افتتاح اليوم',
      CHANGE_COLOR: '#00C853',
      GOLD_24: '5,200',
      GOLD_21: '4,550',
      GOLD_18: '3,900',
      GOLD_POUND: '36,400',
      GOLD_OUNCE: '120,000',
    });

    const png = renderSvgToPng(svg, env);
    expect(png.length).toBeGreaterThan(20_000);

    const fontsDir = path.join(path.resolve(env.SOCIAL_TEMPLATES_DIR), 'fonts');
    expect(fs.readdirSync(fontsDir).some((name) => name.endsWith('.ttf'))).toBe(true);
  });
});
