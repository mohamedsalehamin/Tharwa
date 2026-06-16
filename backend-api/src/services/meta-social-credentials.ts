import { z } from 'zod';
import type { Env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';

export const META_SOCIAL_INTEGRATION_SLUG = 'meta_social';

const scheduleSlotSchema = z.object({
  enabled: z.boolean(),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
});

const goldAlertScheduleSchema = z.object({
  enabled: z.boolean(),
  dropPct: z.number().min(1).max(50),
});

export const metaSocialConfigSchema = z.object({
  pageId: z.string().min(1),
  pageName: z.string().min(1),
  pageAccessToken: z.string().min(20),
  igUserId: z.string().min(1).nullable().optional(),
  igUsername: z.string().min(1).nullable().optional(),
  publishFacebook: z.boolean().default(true),
  publishInstagram: z.boolean().default(true),
  schedules: z
    .object({
      goldDaily: scheduleSlotSchema,
      egxClose: scheduleSlotSchema,
      goldAlert: goldAlertScheduleSchema,
    })
    .optional(),
});

export type MetaSocialConfig = z.infer<typeof metaSocialConfigSchema>;

export type MetaSocialPublic = {
  pageId: string;
  pageName: string;
  igUserId: string | null;
  igUsername: string | null;
  publishFacebook: boolean;
  publishInstagram: boolean;
  schedules: NonNullable<MetaSocialConfig['schedules']>;
  tokenPreview: string | null;
};

function defaultSchedules(env: Env): NonNullable<MetaSocialConfig['schedules']> {
  return {
    goldDaily: {
      enabled: true,
      hour: env.SOCIAL_GOLD_DAILY_HOUR,
      minute: env.SOCIAL_GOLD_DAILY_MINUTE,
    },
    egxClose: {
      enabled: true,
      hour: env.SOCIAL_EGX_CLOSE_HOUR,
      minute: env.SOCIAL_EGX_CLOSE_MINUTE,
    },
    goldAlert: {
      enabled: true,
      dropPct: env.SOCIAL_GOLD_ALERT_DROP_PCT,
    },
  };
}

export function metaSocialPublicFromConfig(
  config: MetaSocialConfig,
  env: Env,
): MetaSocialPublic {
  const token = config.pageAccessToken;
  return {
    pageId: config.pageId,
    pageName: config.pageName,
    igUserId: config.igUserId ?? null,
    igUsername: config.igUsername ?? null,
    publishFacebook: config.publishFacebook,
    publishInstagram: config.publishInstagram,
    schedules: config.schedules ?? defaultSchedules(env),
    tokenPreview: token.length >= 8 ? `${token.slice(0, 4)}…${token.slice(-4)}` : null,
  };
}

export async function getMetaSocialConfig(env: Env): Promise<MetaSocialConfig | null> {
  const row = await prisma.platformIntegration.findUnique({
    where: { slug: META_SOCIAL_INTEGRATION_SLUG },
  });
  if (!row?.config || typeof row.config !== 'object') return null;
  const parsed = metaSocialConfigSchema.safeParse(row.config);
  if (!parsed.success) return null;
  return {
    ...parsed.data,
    schedules: parsed.data.schedules ?? defaultSchedules(env),
  };
}

export async function upsertMetaSocialConfig(
  adminUserId: string,
  input: unknown,
  env: Env,
): Promise<MetaSocialPublic> {
  const parsed = metaSocialConfigSchema.parse(input);
  const config: MetaSocialConfig = {
    ...parsed,
    schedules: parsed.schedules ?? defaultSchedules(env),
  };

  await prisma.platformIntegration.upsert({
    where: { slug: META_SOCIAL_INTEGRATION_SLUG },
    create: {
      slug: META_SOCIAL_INTEGRATION_SLUG,
      displayName: 'Meta (Facebook & Instagram)',
      config,
      updatedByAdminId: adminUserId,
    },
    update: {
      config,
      updatedByAdminId: adminUserId,
    },
  });

  return metaSocialPublicFromConfig(config, env);
}

export async function clearMetaSocialConfig(): Promise<void> {
  await prisma.platformIntegration.deleteMany({ where: { slug: META_SOCIAL_INTEGRATION_SLUG } });
}

export function isMetaOAuthConfigured(env: Env): boolean {
  return Boolean(env.META_APP_ID?.trim() && env.META_APP_SECRET?.trim() && env.META_OAUTH_REDIRECT_URI);
}
