import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { fillTemplate, loadSocialTemplateSvg } from '../../src/services/social-templates.js';
import { renderSvgToPng } from '../../src/services/social-image.js';
import { createTestEnv } from '../helpers/test-env.js';

async function logoRegionHasContent(png: Buffer): Promise<boolean> {
  const { data } = await sharp(png)
    .extract({ left: 72, top: 56, width: 80, height: 80 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const a = data[i + 3]!;
    if (a > 16 && (r > 80 || g > 80)) return true;
  }
  return false;
}

describe('social-image', () => {
  it('renders Arabic template text and composites the Tharwa logo', async () => {
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

    const png = await renderSvgToPng(svg, env);
    expect(png.length).toBeGreaterThan(20_000);
    expect(await logoRegionHasContent(png)).toBe(true);

    const fontsDir = path.join(path.resolve(env.SOCIAL_TEMPLATES_DIR), 'fonts');
    expect(fs.readdirSync(fontsDir).some((name) => name.endsWith('.ttf'))).toBe(true);
  });
});
