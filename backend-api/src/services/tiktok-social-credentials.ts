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
  /** Comma-separated scopes granted at last OAuth connect (e.g. user.info.basic,video.publish). */
  grantedScopes: z.string().optional(),
});

export type TiktokSocialConfig = z.infer<typeof tiktokSocialConfigSchema>;

export type TiktokSocialPublic = {
  openId: string;
  username: string;
  displayName: string;
  publishEnabled: boolean;
  connected: boolean;
  grantedScopes?: string;
  scopeReady: boolean;
  missingScopes: string[];
};

export function parseTiktokScopeList(scopes: string): string[] {
  return scopes
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function requiredTiktokScopesForMode(mode: 'draft' | 'direct'): string[] {
  return mode === 'direct'
    ? ['user.info.basic', 'video.publish']
    : ['user.info.basic', 'video.upload'];
}

export function missingTiktokScopes(
  grantedScopes: string | undefined,
  mode: 'draft' | 'direct',
): string[] {
  const granted = grantedScopes ? parseTiktokScopeList(grantedScopes) : [];
  return requiredTiktokScopesForMode(mode).filter((scope) => !granted.includes(scope));
}

export function tiktokScopeReconnectHint(env: Env): string {
  const mode = getTiktokPostMode(env);
  const scopes = getTiktokOAuthScopes(env);
  return `For ${mode} mode the API requests [${scopes}]. Add the same scopes under TikTok Developer Portal → your app → Scopes (and enable Direct Post for video.publish), then disconnect and reconnect here.`;
}

export function tiktokSocialPublicFromConfig(
  config: TiktokSocialConfig,
  env: Env,
): TiktokSocialPublic {
  const mode = getTiktokPostMode(env);
  const missingScopes = missingTiktokScopes(config.grantedScopes, mode);
  return {
    openId: config.openId,
    username: config.username,
    displayName: config.displayName,
    publishEnabled: config.publishEnabled,
    connected: true,
    grantedScopes: config.grantedScopes,
    scopeReady: missingScopes.length === 0,
    missingScopes,
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
  env: Env,
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
  return tiktokSocialPublicFromConfig(parsed, env);
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
  const configured = parseTiktokScopeList(env.TIKTOK_OAUTH_SCOPES);
  const required = requiredTiktokScopesForMode(getTiktokPostMode(env));
  return [...new Set([...configured, ...required])].join(',');
}

export function getTiktokPostMode(env: Env): 'draft' | 'direct' {
  return env.TIKTOK_POST_MODE;
}
