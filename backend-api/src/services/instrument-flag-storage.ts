import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Env } from '../config/env.js';
import { AppError } from '../lib/errors.js';

export type InstrumentFlagKind = 'fx' | 'metal';

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

const ALLOWED_MIME = new Set(Object.keys(MIME_EXT));
const MAX_BYTES = 512 * 1024;

const FLAG_DIR: Record<InstrumentFlagKind, string> = {
  fx: 'fx-flags',
  metal: 'metal-flags',
};

export function instrumentFlagRelativePath(
  kind: InstrumentFlagKind,
  code: string,
  mime: string,
): string {
  const ext = MIME_EXT[mime];
  if (!ext) {
    throw new AppError('VALIDATION', 'Unsupported image type', 400);
  }
  const safeCode = code.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
  if (!safeCode) {
    throw new AppError('VALIDATION', 'Invalid instrument code', 400);
  }
  return `/files/${FLAG_DIR[kind]}/${safeCode}.${ext}`;
}

export function publicFileUrl(env: Env, relativePath: string, requestOrigin?: string): string {
  const rel = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
  const origin =
    env.PUBLIC_FILES_ORIGIN?.replace(/\/$/, '') ??
    requestOrigin?.replace(/\/$/, '') ??
    `http://127.0.0.1:${env.PORT}`;
  return `${origin}${rel}`;
}

/** Extract `/files/...` from a stored relative or absolute public upload URL. */
export function publicUploadRelativePath(storedUrl: string): string | undefined {
  const trimmed = storedUrl.trim();
  if (trimmed.startsWith('/files/')) return trimmed;
  try {
    const pathname = new URL(trimmed).pathname;
    if (pathname.startsWith('/files/')) return pathname;
  } catch {
    /* ignore invalid URLs */
  }
  return undefined;
}

/** Rebase stored upload URLs onto the current public files origin. */
export function resolvePublicFileUrl(env: Env, storedUrl: string, requestOrigin?: string): string {
  const rel = publicUploadRelativePath(storedUrl);
  if (rel) return publicFileUrl(env, rel, requestOrigin);
  return storedUrl;
}

export async function saveInstrumentFlagFile(
  env: Env,
  kind: InstrumentFlagKind,
  code: string,
  buffer: Buffer,
  mime: string,
): Promise<string> {
  if (!ALLOWED_MIME.has(mime)) {
    throw new AppError('VALIDATION', 'Image must be PNG, JPEG, WebP, or SVG', 400);
  }
  if (buffer.length > MAX_BYTES) {
    throw new AppError('VALIDATION', 'Image must be 512 KB or smaller', 400);
  }

  const relative = instrumentFlagRelativePath(kind, code, mime);
  const subdir = FLAG_DIR[kind];
  await mkdir(path.join(env.PUBLIC_UPLOADS_DIR, subdir), { recursive: true });
  await writeFile(path.join(env.PUBLIC_UPLOADS_DIR, relative.replace(/^\/files\//, '')), buffer);

  return relative;
}
