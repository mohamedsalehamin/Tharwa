import { z } from 'zod';
import type { Env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';

export const YOUTUBE_SOCIAL_INTEGRATION_SLUG = 'youtube_social';

export const youtubeSocialConfigSchema = z.object({
  channelId: z.string().min(1),
  channelTitle: z.string().min(1),
  refreshToken: z.string().min(20),
  publishEnabled: z.boolean().default(true),
});

export type YoutubeSocialConfig = z.infer<typeof youtubeSocialConfigSchema>;

export type YoutubeSocialPublic = {
  channelId: string;
  channelTitle: string;
  publishEnabled: boolean;
  connected: boolean;
};

export function youtubeSocialPublicFromConfig(config: YoutubeSocialConfig): YoutubeSocialPublic {
  return {
    channelId: config.channelId,
    channelTitle: config.channelTitle,
    publishEnabled: config.publishEnabled,
    connected: true,
  };
}

export async function getYoutubeSocialConfig(_env: Env): Promise<YoutubeSocialConfig | null> {
  const row = await prisma.platformIntegration.findUnique({
    where: { slug: YOUTUBE_SOCIAL_INTEGRATION_SLUG },
  });
  if (!row?.config || typeof row.config !== 'object') return null;
  const parsed = youtubeSocialConfigSchema.safeParse(row.config);
  return parsed.success ? parsed.data : null;
}

export async function upsertYoutubeSocialConfig(
  adminUserId: string,
  input: unknown,
): Promise<YoutubeSocialPublic> {
  const parsed = youtubeSocialConfigSchema.parse(input);
  await prisma.platformIntegration.upsert({
    where: { slug: YOUTUBE_SOCIAL_INTEGRATION_SLUG },
    create: {
      slug: YOUTUBE_SOCIAL_INTEGRATION_SLUG,
      displayName: 'YouTube (Shorts)',
      config: parsed,
      updatedByAdminId: adminUserId,
    },
    update: {
      config: parsed,
      updatedByAdminId: adminUserId,
    },
  });
  return youtubeSocialPublicFromConfig(parsed);
}

export async function clearYoutubeSocialConfig(): Promise<void> {
  await prisma.platformIntegration.deleteMany({ where: { slug: YOUTUBE_SOCIAL_INTEGRATION_SLUG } });
}

export function isYoutubeOAuthConfigured(env: Env): boolean {
  return Boolean(
    env.YOUTUBE_OAUTH_CLIENT_ID?.trim() &&
      env.YOUTUBE_OAUTH_CLIENT_SECRET?.trim() &&
      env.YOUTUBE_OAUTH_REDIRECT_URI,
  );
}

export const YOUTUBE_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
].join(' ');
