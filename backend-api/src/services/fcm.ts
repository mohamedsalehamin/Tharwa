import admin from 'firebase-admin';
import type { Env } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import { resolveFcmServiceAccountJson } from './fcm-credentials.js';

let messaging: admin.messaging.Messaging | null = null;
let loadedConfigFingerprint: string | null = null;

function parseServiceAccount(json: string): admin.ServiceAccount {
  try {
    return JSON.parse(json) as admin.ServiceAccount;
  } catch {
    throw new AppError('CONFIG', 'FCM service account is not valid JSON', 500);
  }
}

export async function isFcmConfigured(env: Env): Promise<boolean> {
  return Boolean(await resolveFcmServiceAccountJson(env));
}

export async function resetFcmClient(): Promise<void> {
  messaging = null;
  loadedConfigFingerprint = null;
  for (const app of admin.apps) {
    if (app) await app.delete();
  }
}

async function getMessaging(env: Env): Promise<admin.messaging.Messaging> {
  const raw = await resolveFcmServiceAccountJson(env);
  if (!raw) {
    throw new AppError(
      'SERVICE_UNAVAILABLE',
      'FCM is not configured. Upload a service account in Admin → Settings → Integrations.',
      503,
    );
  }
  const fingerprint = raw;
  if (messaging && loadedConfigFingerprint === fingerprint) {
    return messaging;
  }
  await resetFcmClient();
  const cred = parseServiceAccount(raw);
  const app = admin.initializeApp({
    credential: admin.credential.cert(cred),
  });
  messaging = admin.messaging(app);
  loadedConfigFingerprint = fingerprint;
  return messaging;
}

export type FcmMulticastResult = {
  successCount: number;
  failureCount: number;
  invalidTokens: string[];
};

export async function sendFcmMulticast(
  env: Env,
  tokens: string[],
  message: { title: string; body: string; data?: Record<string, string> },
): Promise<FcmMulticastResult> {
  if (tokens.length === 0) {
    return { successCount: 0, failureCount: 0, invalidTokens: [] };
  }
  const msg = await getMessaging(env);
  const res = await msg.sendEachForMulticast({
    tokens,
    notification: { title: message.title, body: message.body },
    data: message.data,
    android: { priority: 'high' },
    apns: { payload: { aps: { sound: 'default' } } },
  });
  const invalidTokens: string[] = [];
  res.responses.forEach((r, i) => {
    if (r.success) return;
    const code = r.error?.code;
    if (
      code === 'messaging/registration-token-not-registered' ||
      code === 'messaging/invalid-registration-token'
    ) {
      const t = tokens[i];
      if (t) invalidTokens.push(t);
    }
  });
  return {
    successCount: res.successCount,
    failureCount: res.failureCount,
    invalidTokens,
  };
}
