import { Resvg } from '@resvg/resvg-js';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Env } from '../config/env.js';
import { resolveSocialTemplatesDir } from './social-templates.js';

function listSocialTemplateFontFiles(env: Env): string[] {
  const fontsDir = path.join(resolveSocialTemplatesDir(env), 'fonts');
  return fs
    .readdirSync(fontsDir)
    .filter((name) => name.endsWith('.ttf'))
    .map((name) => path.join(fontsDir, name));
}

export function renderSvgToPng(svg: string, env: Env): Buffer {
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
