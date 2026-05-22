import type { Env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import {
  FCM_INTEGRATION_SLUG,
  fcmPublicFromAccount,
  fcmServiceAccountSchema,
  parseFcmServiceAccountJson,
  resolveFcmServiceAccountJson,
  type FcmServiceAccountPublic,
} from './fcm-credentials.js';
import { resetFcmClient } from './fcm.js';

export { FCM_INTEGRATION_SLUG, isFcmConfiguredAnywhere } from './fcm-credentials.js';

export type IntegrationListItem = {
  slug: string;
  displayName: string;
  configured: boolean;
  source: 'database' | 'environment' | null;
  updatedAt: string | null;
  fcm?: FcmServiceAccountPublic;
};

export async function listIntegrations(env: Env): Promise<IntegrationListItem[]> {
  const fcmRow = await prisma.platformIntegration.findUnique({ where: { slug: FCM_INTEGRATION_SLUG } });
  const envJson = env.FCM_SERVICE_ACCOUNT_JSON?.trim();
  let fcmPublic: FcmServiceAccountPublic | undefined;
  let fcmSource: IntegrationListItem['source'] = null;
  let fcmConfigured = false;
  let fcmUpdatedAt: string | null = null;

  if (fcmRow?.config && typeof fcmRow.config === 'object') {
    const sa = (fcmRow.config as { serviceAccount?: unknown }).serviceAccount;
    if (sa && typeof sa === 'object') {
      const validated = fcmServiceAccountSchema.safeParse(sa);
      if (validated.success) {
        fcmConfigured = true;
        fcmSource = 'database';
        fcmPublic = fcmPublicFromAccount(validated.data);
        fcmUpdatedAt = fcmRow.updatedAt.toISOString();
      }
    }
  } else if (envJson) {
    try {
      const validated = parseFcmServiceAccountJson(envJson);
      fcmConfigured = true;
      fcmSource = 'environment';
      fcmPublic = fcmPublicFromAccount(validated);
    } catch {
      fcmConfigured = true;
      fcmSource = 'environment';
    }
  }

  return [
    {
      slug: FCM_INTEGRATION_SLUG,
      displayName: fcmRow?.displayName ?? 'Firebase Cloud Messaging',
      configured: fcmConfigured,
      source: fcmSource,
      updatedAt: fcmUpdatedAt,
      fcm: fcmPublic,
    },
  ];
}

export async function upsertFcmServiceAccount(
  adminUserId: string,
  serviceAccount: unknown,
): Promise<FcmServiceAccountPublic> {
  const validated =
    typeof serviceAccount === 'string'
      ? parseFcmServiceAccountJson(serviceAccount)
      : fcmServiceAccountSchema.parse(serviceAccount);

  await prisma.platformIntegration.upsert({
    where: { slug: FCM_INTEGRATION_SLUG },
    create: {
      slug: FCM_INTEGRATION_SLUG,
      displayName: 'Firebase Cloud Messaging',
      config: { serviceAccount: validated },
      updatedByAdminId: adminUserId,
    },
    update: {
      config: { serviceAccount: validated },
      updatedByAdminId: adminUserId,
    },
  });
  await resetFcmClient();
  return fcmPublicFromAccount(validated);
}

export async function clearFcmServiceAccount(): Promise<void> {
  await prisma.platformIntegration.deleteMany({ where: { slug: FCM_INTEGRATION_SLUG } });
  await resetFcmClient();
}

/** @internal re-export for tests */
export { resolveFcmServiceAccountJson };
