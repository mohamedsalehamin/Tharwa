import { z } from 'zod';
import type { Env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';

export const TIKTOK_SOCIAL_INTEGRATION_SLUG = 'tiktok_social';

export const tiktokSocialConfigSchema = z.object({
  openId: z.string().min(1),
  username: z.string().min(1),
  displayName: z.string().min(1),
  refreshToken: z.string().min(20),
  publishEnabled: z.boolean().default(true),
});

export type TiktokSocialConfig = z.infer<typeof tiktokSocialConfigSchema>;

export type TiktokSocialPublic = {
  openId: string;
  username: string;
  displayName: string;
  publishEnabled: boolean;
  connected: boolean;
};

export function tiktokSocialPublicFromConfig(config: TiktokSocialConfig): TiktokSocialPublic {
  return {
    openId: config.openId,
    username: config.username,
    displayName: config.displayName,
    publishEnabled: config.publishEnabled,
    connected: true,
  };
}

export async function getTiktokSocialConfig(_env: Env): Promise<TiktokSocialConfig | null> {
  const row = await prisma.platformIntegration.findUnique({
    where: { slug: TIKTOK_SOCIAL_INTEGRATION_SLUG },
  });
  if (!row?.config || typeof row.config !== 'object') return null;
  const parsed = tiktokSocialConfigSchema.safeParse(row.config);
  return parsed.success ? parsed.data : null;
}

export async function upsertTiktokSocialConfig(
  adminUserId: string,
  input: unknown,
): Promise<TiktokSocialPublic> {
  const parsed = tiktokSocialConfigSchema.parse(input);
  await prisma.platformIntegration.upsert({
    where: { slug: TIKTOK_SOCIAL_INTEGRATION_SLUG },
    create: {
      slug: TIKTOK_SOCIAL_INTEGRATION_SLUG,
      displayName: 'TikTok',
      config: parsed,
      updatedByAdminId: adminUserId,
    },
    update: {
      config: parsed,
      updatedByAdminId: adminUserId,
    },
  });
  return tiktokSocialPublicFromConfig(parsed);
}

export async function updateTiktokSocialRefreshToken(refreshToken: string): Promise<void> {
  const row = await prisma.platformIntegration.findUnique({
    where: { slug: TIKTOK_SOCIAL_INTEGRATION_SLUG },
  });
  if (!row?.config || typeof row.config !== 'object') return;
  const parsed = tiktokSocialConfigSchema.safeParse(row.config);
  if (!parsed.success || parsed.data.refreshToken === refreshToken) return;
  await prisma.platformIntegration.update({
    where: { slug: TIKTOK_SOCIAL_INTEGRATION_SLUG },
    data: { config: { ...parsed.data, refreshToken } },
  });
}

export async function clearTiktokSocialConfig(): Promise<void> {
  await prisma.platformIntegration.deleteMany({ where: { slug: TIKTOK_SOCIAL_INTEGRATION_SLUG } });
}

export function isTiktokOAuthConfigured(env: Env): boolean {
  return Boolean(
    env.TIKTOK_OAUTH_CLIENT_KEY?.trim() &&
      env.TIKTOK_OAUTH_CLIENT_SECRET?.trim() &&
      env.TIKTOK_OAUTH_REDIRECT_URI,
  );
}

export function getTiktokOAuthScopes(env: Env): string {
  return env.TIKTOK_OAUTH_SCOPES.trim();
}

export function getTiktokPostMode(env: Env): 'draft' | 'direct' {
  return env.TIKTOK_POST_MODE;
}
