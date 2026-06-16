import { Resvg } from '@resvg/resvg-js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Env } from '../config/env.js';

export function renderSvgToPng(svg: string): Buffer {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1080 },
    font: {
      loadSystemFonts: false,
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
  await fs.mkdir(dir, { recursive: true });
  const filename = `${randomUUID()}.png`;
  const filePath = path.join(dir, filename);
  await fs.writeFile(filePath, png);
  const relativePath = `social/${filename}`;
  const origin = env.SOCIAL_PUBLIC_FILES_ORIGIN ?? env.PUBLIC_FILES_ORIGIN;
  if (!origin) {
    throw new Error('SOCIAL_PUBLIC_FILES_ORIGIN or PUBLIC_FILES_ORIGIN must be set for Instagram publishing');
  }
  const publicUrl = `${origin.replace(/\/$/, '')}/files/${relativePath}`;
  return { relativePath, publicUrl };
}
