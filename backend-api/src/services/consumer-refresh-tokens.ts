import type { Env } from '../config/env.js';
import { hashOpaqueToken, issueOpaqueToken } from '../lib/opaque-token.js';
import { prisma } from '../lib/prisma.js';

export type IssuedRefreshToken = {
  refreshToken: string;
  expiresAt: Date;
};

export async function issueConsumerRefreshToken(
  env: Env,
  consumerUserId: string,
): Promise<IssuedRefreshToken> {
  const refreshToken = issueOpaqueToken();
  const tokenHash = hashOpaqueToken(refreshToken);
  const expiresAt = new Date(Date.now() + env.CONSUMER_REFRESH_TOKEN_TTL_SEC * 1000);
  await prisma.consumerRefreshToken.create({
    data: { consumerUserId, tokenHash, expiresAt },
  });
  return { refreshToken, expiresAt };
}

export async function rotateConsumerRefreshToken(
  env: Env,
  refreshToken: string,
): Promise<{ userId: string; email: string; newRefreshToken: string; expiresAt: Date } | null> {
  const tokenHash = hashOpaqueToken(refreshToken);
  const row = await prisma.consumerRefreshToken.findUnique({
    where: { tokenHash },
    include: { consumerUser: { select: { id: true, email: true } } },
  });
  if (!row || row.revokedAt || row.expiresAt <= new Date()) return null;

  await prisma.consumerRefreshToken.update({
    where: { id: row.id },
    data: { revokedAt: new Date() },
  });

  const issued = await issueConsumerRefreshToken(env, row.consumerUserId);
  return {
    userId: row.consumerUser.id,
    email: row.consumerUser.email,
    newRefreshToken: issued.refreshToken,
    expiresAt: issued.expiresAt,
  };
}

export async function revokeConsumerRefreshToken(refreshToken: string): Promise<boolean> {
  const tokenHash = hashOpaqueToken(refreshToken);
  const row = await prisma.consumerRefreshToken.findUnique({ where: { tokenHash } });
  if (!row || row.revokedAt) return false;
  await prisma.consumerRefreshToken.update({
    where: { id: row.id },
    data: { revokedAt: new Date() },
  });
  return true;
}

export async function revokeAllConsumerRefreshTokens(consumerUserId: string): Promise<void> {
  await prisma.consumerRefreshToken.updateMany({
    where: { consumerUserId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
