import { Resvg } from '@resvg/resvg-js';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { Env } from '../config/env.js';
import { resolveSocialTemplatesDir } from './social-templates.js';

const SOCIAL_LOGO_FILE = 'tharwa-logo.png';
const SOCIAL_LOGO_LAYOUT = { left: 72, top: 56, width: 80, height: 80 };

function listSocialTemplateFontFiles(env: Env): string[] {
  const fontsDir = path.join(resolveSocialTemplatesDir(env), 'fonts');
  return fs
    .readdirSync(fontsDir)
    .filter((name) => name.endsWith('.ttf'))
    .map((name) => path.join(fontsDir, name));
}

/** resvg is unreliable for large embedded raster logos; strip and composite after render. */
function stripRasterImageNodes(svg: string): string {
  return svg.replace(/<image\b[^>]*\/?>\s*/gi, '');
}

function renderSvgBase(svg: string, env: Env): Buffer {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1080 },
    font: {
      loadSystemFonts: false,
      fontFiles: listSocialTemplateFontFiles(env),
    },
  });
  const rendered = resvg.render();
  return Buffer.from(rendered.asPng());
}

async function compositeSocialLogo(basePng: Buffer, env: Env): Promise<Buffer> {
  const logoPath = path.join(resolveSocialTemplatesDir(env), SOCIAL_LOGO_FILE);
  try {
    await fsPromises.access(logoPath);
  } catch {
    return basePng;
  }

  const logoPng = await sharp(logoPath)
    .resize(SOCIAL_LOGO_LAYOUT.width, SOCIAL_LOGO_LAYOUT.height, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  return sharp(basePng)
    .composite([
      {
        input: logoPng,
        left: SOCIAL_LOGO_LAYOUT.left,
        top: SOCIAL_LOGO_LAYOUT.top,
      },
    ])
    .png()
    .toBuffer();
}

export async function renderSvgToPng(svg: string, env: Env): Promise<Buffer> {
  const basePng = renderSvgBase(stripRasterImageNodes(svg), env);
  return compositeSocialLogo(basePng, env);
}

export async function writePublicSocialImage(
  env: Env,
  png: Buffer,
): Promise<{ relativePath: string; publicUrl: string }> {
  const dir = path.resolve(env.PUBLIC_UPLOADS_DIR, 'social');
  await fsPromises.mkdir(dir, { recursive: true });
  const filename = `${randomUUID()}.png`;
  const filePath = path.join(dir, filename);
  await fsPromises.writeFile(filePath, png);
  const relativePath = `social/${filename}`;
  const origin = env.SOCIAL_PUBLIC_FILES_ORIGIN ?? env.PUBLIC_FILES_ORIGIN;
  if (!origin) {
    throw new Error('SOCIAL_PUBLIC_FILES_ORIGIN or PUBLIC_FILES_ORIGIN must be set for Instagram publishing');
  }
  const publicUrl = `${origin.replace(/\/$/, '')}/files/${relativePath}`;
  return { relativePath, publicUrl };
}
