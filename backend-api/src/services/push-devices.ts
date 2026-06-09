import type { Prisma, PushPlatform } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import type { Env } from '../config/env.js';
import { sendFcmMulticast } from './fcm.js';
import {
  PUSH_AUDIENCES,
  pushAudienceWhere,
  type PushBroadcastAudience,
} from './push-audience.js';
import { normalizeBriefLocale, type BriefLocale, type LocalizedPushMessages } from './brief-locale.js';
import { createConsumerNotifications } from './consumer-notifications.js';

const TOKEN_BATCH = 500;

export async function upsertPushDevice(input: {
  fcmToken: string;
  platform: PushPlatform;
  installId?: string | null;
  consumerUserId?: string | null;
  locale?: string | null;
}): Promise<void> {
  const now = new Date();
  const data = {
    platform: input.platform,
    installId: input.installId ?? null,
    consumerUserId: input.consumerUserId ?? null,
    locale: input.locale ?? null,
    lastSeenAt: now,
    disabledAt: null,
  };

  if (input.installId) {
    await prisma.pushDevice.deleteMany({
      where: {
        installId: input.installId,
        fcmToken: { not: input.fcmToken },
      },
    });
  }

  await prisma.pushDevice.upsert({
    where: { fcmToken: input.fcmToken },
    create: { fcmToken: input.fcmToken, ...data },
    update: data,
  });
}

export async function disablePushDevice(fcmToken: string): Promise<void> {
  await prisma.pushDevice.updateMany({
    where: { fcmToken, disabledAt: null },
    data: { disabledAt: new Date() },
  });
}

export async function countPushAudience(audience: PushBroadcastAudience): Promise<number> {
  return prisma.pushDevice.count({ where: pushAudienceWhere(audience) });
}

export async function pushAudienceStats(): Promise<
  { audience: PushBroadcastAudience; deviceCount: number }[]
> {
  const counts = await Promise.all(
    PUSH_AUDIENCES.map(async (audience) => ({
      audience,
      deviceCount: await countPushAudience(audience),
    })),
  );
  return counts;
}

async function* iterateAudienceTokens(
  audience: PushBroadcastAudience,
): AsyncGenerator<string[]> {
  let cursor: string | undefined;
  for (;;) {
    const rows = await prisma.pushDevice.findMany({
      where: pushAudienceWhere(audience),
      select: { id: true, fcmToken: true },
      orderBy: { id: 'asc' },
      take: TOKEN_BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (rows.length === 0) return;
    yield rows.map((r) => r.fcmToken);
    cursor = rows[rows.length - 1]?.id;
    if (rows.length < TOKEN_BATCH) return;
  }
}

export type BroadcastPushResult = {
  audience: PushBroadcastAudience;
  targetedDeviceCount: number;
  batches: number;
  successCount: number;
  failureCount: number;
  invalidTokensRemoved: number;
};

export async function broadcastPush(
  env: Env,
  input: {
    audience: PushBroadcastAudience;
    title: string;
    body: string;
    data?: Record<string, string>;
  },
): Promise<BroadcastPushResult> {
  const targetedDeviceCount = await countPushAudience(input.audience);
  let batches = 0;
  let successCount = 0;
  let failureCount = 0;
  let invalidTokensRemoved = 0;

  for await (const tokens of iterateAudienceTokens(input.audience)) {
    batches += 1;
    const res = await sendFcmMulticast(env, tokens, {
      title: input.title,
      body: input.body,
      data: input.data,
    });
    successCount += res.successCount;
    failureCount += res.failureCount;
    if (res.invalidTokens.length > 0) {
      await prisma.pushDevice.updateMany({
        where: { fcmToken: { in: res.invalidTokens } },
        data: { disabledAt: new Date() },
      });
      invalidTokensRemoved += res.invalidTokens.length;
    }
  }

  return {
    audience: input.audience,
    targetedDeviceCount,
    batches,
    successCount,
    failureCount,
    invalidTokensRemoved,
  };
}

export type LocalizedPushResult = {
  targetedDeviceCount: number;
  batches: number;
  successCount: number;
  failureCount: number;
  invalidTokensRemoved: number;
};

type ActiveDevice = {
  fcmToken: string;
  locale: BriefLocale;
  installId: string | null;
  consumerUserId: string | null;
};

async function* iterateActiveDevices(
  where: Prisma.PushDeviceWhereInput = { disabledAt: null },
): AsyncGenerator<ActiveDevice[]> {
  let cursor: string | undefined;
  for (;;) {
    const rows = await prisma.pushDevice.findMany({
      where,
      select: {
        id: true,
        fcmToken: true,
        locale: true,
        installId: true,
        consumerUserId: true,
      },
      orderBy: { id: 'asc' },
      take: TOKEN_BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (rows.length === 0) return;
    yield rows.map((r) => ({
      fcmToken: r.fcmToken,
      locale: normalizeBriefLocale(r.locale),
      installId: r.installId,
      consumerUserId: r.consumerUserId,
    }));
    cursor = rows[rows.length - 1]?.id;
    if (rows.length < TOKEN_BATCH) return;
  }
}

async function sendTokensForLocale(
  env: Env,
  locale: BriefLocale,
  tokens: string[],
  message: LocalizedPushMessages,
  data: Record<string, string> | undefined,
): Promise<Pick<LocalizedPushResult, 'batches' | 'successCount' | 'failureCount' | 'invalidTokensRemoved'>> {
  if (tokens.length === 0) {
    return { batches: 0, successCount: 0, failureCount: 0, invalidTokensRemoved: 0 };
  }
  const copy = message[locale];
  let batches = 0;
  let successCount = 0;
  let failureCount = 0;
  let invalidTokensRemoved = 0;

  for (let i = 0; i < tokens.length; i += TOKEN_BATCH) {
    const chunk = tokens.slice(i, i + TOKEN_BATCH);
    batches += 1;
    const res = await sendFcmMulticast(env, chunk, {
      title: copy.title,
      body: copy.body,
      data,
    });
    successCount += res.successCount;
    failureCount += res.failureCount;
    if (res.invalidTokens.length > 0) {
      await prisma.pushDevice.updateMany({
        where: { fcmToken: { in: res.invalidTokens } },
        data: { disabledAt: new Date() },
      });
      invalidTokensRemoved += res.invalidTokens.length;
    }
  }

  return { batches, successCount, failureCount, invalidTokensRemoved };
}

/** Send push with per-device locale (defaults to Arabic when unset). */
export async function sendLocalizedPush(
  env: Env,
  input: {
    messages: LocalizedPushMessages;
    data?: Record<string, string>;
    where?: Prisma.PushDeviceWhereInput;
    notificationType?: string;
  },
): Promise<LocalizedPushResult> {
  const where: Prisma.PushDeviceWhereInput = { disabledAt: null, ...input.where };
  const targetedDeviceCount = await prisma.pushDevice.count({ where });
  const devices: ActiveDevice[] = [];
  const byLocale: Record<BriefLocale, string[]> = { ar: [], en: [] };

  for await (const batch of iterateActiveDevices(where)) {
    for (const row of batch) {
      devices.push(row);
      byLocale[row.locale].push(row.fcmToken);
    }
  }

  if (input.notificationType && devices.length > 0) {
    await createConsumerNotifications(
      devices.map((d) => ({
        installId: d.installId,
        consumerUserId: d.consumerUserId,
        type: input.notificationType!,
        locale: d.locale,
        title: input.messages[d.locale].title,
        body: input.messages[d.locale].body,
      })),
    );
  }

  let batches = 0;
  let successCount = 0;
  let failureCount = 0;
  let invalidTokensRemoved = 0;

  for (const locale of ['ar', 'en'] as const) {
    const res = await sendTokensForLocale(
      env,
      locale,
      byLocale[locale],
      input.messages,
      input.data,
    );
    batches += res.batches;
    successCount += res.successCount;
    failureCount += res.failureCount;
    invalidTokensRemoved += res.invalidTokensRemoved;
  }

  return { targetedDeviceCount, batches, successCount, failureCount, invalidTokensRemoved };
}
