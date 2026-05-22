import { UpstreamType } from '@prisma/client';
import { z } from 'zod';
import type { Env } from '../config/env.js';
import { getSecretsResolver } from '../lib/secrets/resolver.js';
import { prisma } from '../lib/prisma.js';

const metalsConfigSchema = z.object({
  channelId: z.string().min(1),
  peekPendingChannelUpdates: z.boolean().optional(),
});

export type MetalsTelegramCredentials = {
  botToken: string;
  channelId: string;
  peekPendingChannelUpdates: boolean;
  source: 'upstream_db' | 'process_env';
};

/**
 * Telegram metals credentials: prefer enabled `upstream_connections` row (`type=metals`)
 * with `secretRef` → env var for bot token and `config.channelId` for the channel.
 * Falls back to `TELEGRAM_METALS_*` process env when no DB row is configured.
 */
export async function resolveMetalsTelegramCredentials(env: Env): Promise<MetalsTelegramCredentials | null> {
  const row = await prisma.upstreamConnection.findFirst({
    where: { type: UpstreamType.metals, enabled: true },
    orderBy: { updatedAt: 'desc' },
  });

  if (row) {
    const parsed = metalsConfigSchema.safeParse(row.config);
    if (parsed.success && row.secretRef?.trim()) {
      const secrets = getSecretsResolver(env);
      const botToken = secrets.resolve(row.secretRef);
      if (botToken) {
        return {
          botToken,
          channelId: parsed.data.channelId.trim(),
          peekPendingChannelUpdates: parsed.data.peekPendingChannelUpdates ?? false,
          source: 'upstream_db',
        };
      }
    }
  }

  const botToken = env.TELEGRAM_METALS_BOT_TOKEN?.trim();
  const channelId = env.TELEGRAM_METALS_CHANNEL_ID?.trim();
  if (!botToken || !channelId) return null;

  return {
    botToken,
    channelId,
    peekPendingChannelUpdates: env.TELEGRAM_METALS_PEEK_UPDATES,
    source: 'process_env',
  };
}
