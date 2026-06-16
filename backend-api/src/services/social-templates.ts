import fs from 'node:fs/promises';
import path from 'node:path';
import type { Env } from '../config/env.js';

export type SocialTemplateKey = 'gold_daily' | 'gold_alert' | 'egx_close';

const TEMPLATE_FILES: Record<SocialTemplateKey, string> = {
  gold_daily: 'gold-daily.svg',
  gold_alert: 'gold-alert.svg',
  egx_close: 'egx-close.svg',
};

const CAPTION_FILES: Record<SocialTemplateKey, string> = {
  gold_daily: 'caption-gold-daily.example.txt',
  gold_alert: 'caption-gold-daily.example.txt',
  egx_close: 'caption-egx-close.example.txt',
};

const RASTER_IMAGE_RE = /href="([^"]+\.(?:png|jpe?g|gif))"/gi;

function mimeForRasterImage(filePath: string): string {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'gif') return 'image/gif';
  return 'image/jpeg';
}

function resolveRasterImagePath(href: string, templatesDir: string): string | null {
  if (
    href.startsWith('data:') ||
    href.startsWith('http://') ||
    href.startsWith('https://')
  ) {
    return null;
  }
  if (href.startsWith('file://')) return href.slice('file://'.length);
  return path.join(templatesDir, href);
}

/** resvg cannot load local file:// images; inline PNG/JPEG/GIF assets as data URIs. */
async function embedRasterImages(svg: string, templatesDir: string): Promise<string> {
  const hrefs = [...svg.matchAll(RASTER_IMAGE_RE)].map((match) => match[1]!);
  if (hrefs.length === 0) return svg;

  const dataUriByHref = new Map<string, string>();
  for (const href of hrefs) {
    if (dataUriByHref.has(href)) continue;
    const abs = resolveRasterImagePath(href, templatesDir);
    if (!abs) continue;
    const bytes = await fs.readFile(abs);
    const dataUri = `data:${mimeForRasterImage(abs)};base64,${bytes.toString('base64')}`;
    dataUriByHref.set(href, dataUri);
  }

  let out = svg;
  for (const [href, dataUri] of dataUriByHref) {
    out = out.replaceAll(`href="${href}"`, `href="${dataUri}"`);
  }
  return out;
}

export function resolveSocialTemplatesDir(env: Env): string {
  return path.resolve(env.SOCIAL_TEMPLATES_DIR);
}

export async function loadSocialTemplateSvg(
  env: Env,
  template: SocialTemplateKey,
): Promise<string> {
  const dir = resolveSocialTemplatesDir(env);
  const filePath = path.join(dir, TEMPLATE_FILES[template]);
  let svg = await fs.readFile(filePath, 'utf8');
  svg = await embedRasterImages(svg, dir);
  svg = rewriteAssetPaths(svg, dir);
  return svg;
}

export async function loadSocialCaptionTemplate(
  env: Env,
  template: SocialTemplateKey,
): Promise<string> {
  const dir = resolveSocialTemplatesDir(env);
  const filePath = path.join(dir, CAPTION_FILES[template]);
  return fs.readFile(filePath, 'utf8');
}

/** Resolve relative font paths so resvg can load them. */
function rewriteAssetPaths(svg: string, templatesDir: string): string {
  const toFileUrl = (rel: string) => {
    const abs = path.join(templatesDir, rel).replace(/\\/g, '/');
    return `file://${abs}`;
  };
  return svg
    .replace(/url\('([^']+)'\)/g, (_m, rel: string) => {
      if (rel.startsWith('file://')) return `url('${rel}')`;
      return `url('${toFileUrl(rel)}')`;
    })
    .replace(/href="([^"]+)"/g, (_m, rel: string) => {
      if (rel.startsWith('file://') || rel.startsWith('http')) return `href="${rel}"`;
      return `href="${toFileUrl(rel)}"`;
    });
}

export function fillTemplate(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{{${key}}}`, value);
  }
  return out;
}
