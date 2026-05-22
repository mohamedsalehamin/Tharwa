import { z } from 'zod';
import type { Env } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';

export const FCM_INTEGRATION_SLUG = 'fcm';

export const fcmServiceAccountSchema = z.object({
  type: z.literal('service_account'),
  project_id: z.string().min(1),
  private_key: z.string().min(1),
  client_email: z.string().email(),
});

export type FcmServiceAccount = z.infer<typeof fcmServiceAccountSchema>;

export type FcmServiceAccountPublic = {
  projectId: string;
  clientEmail: string;
};

export function parseFcmServiceAccountJson(raw: string): FcmServiceAccount {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AppError('VALIDATION', 'Service account file is not valid JSON', 400);
  }
  const result = fcmServiceAccountSchema.safeParse(parsed);
  if (!result.success) {
    throw new AppError(
      'VALIDATION',
      'Expected a Firebase service account JSON (type, project_id, private_key, client_email)',
      400,
    );
  }
  return result.data;
}

export function fcmPublicFromAccount(account: FcmServiceAccount): FcmServiceAccountPublic {
  return { projectId: account.project_id, clientEmail: account.client_email };
}

export async function resolveFcmServiceAccountJson(env: Env): Promise<string | null> {
  const row = await prisma.platformIntegration.findUnique({ where: { slug: FCM_INTEGRATION_SLUG } });
  if (row?.config && typeof row.config === 'object' && row.config !== null) {
    const cfg = row.config as { serviceAccount?: unknown };
    if (cfg.serviceAccount && typeof cfg.serviceAccount === 'object') {
      return JSON.stringify(cfg.serviceAccount);
    }
  }
  const fromEnv = env.FCM_SERVICE_ACCOUNT_JSON?.trim();
  return fromEnv || null;
}

export async function isFcmConfiguredAnywhere(env: Env): Promise<boolean> {
  return Boolean(await resolveFcmServiceAccountJson(env));
}
