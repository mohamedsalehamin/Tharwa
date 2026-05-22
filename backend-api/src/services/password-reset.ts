import type { Env } from '../config/env.js';
import { hashOpaqueToken, issueOpaqueToken } from '../lib/opaque-token.js';
import { prisma } from '../lib/prisma.js';
import { hashPassword } from './password.js';

export type IssuedPasswordReset = {
  resetToken: string;
  expiresAt: Date;
};

/** Creates a reset token; caller sends email via transactional-email service. */
export async function issuePasswordResetToken(
  env: Env,
  emailRaw: string,
): Promise<IssuedPasswordReset | null> {
  const email = emailRaw.trim().toLowerCase();
  const user = await prisma.consumerUser.findUnique({ where: { email } });
  if (!user) return null;

  await prisma.passwordResetToken.updateMany({
    where: { consumerUserId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  const resetToken = issueOpaqueToken();
  const expiresAt = new Date(Date.now() + env.PASSWORD_RESET_TOKEN_TTL_SEC * 1000);
  await prisma.passwordResetToken.create({
    data: {
      consumerUserId: user.id,
      tokenHash: hashOpaqueToken(resetToken),
      expiresAt,
    },
  });
  return { resetToken, expiresAt };
}

export async function consumePasswordResetToken(
  resetToken: string,
  newPassword: string,
): Promise<{ id: string; email: string } | null> {
  const tokenHash = hashOpaqueToken(resetToken);
  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { consumerUser: true },
  });
  if (!row || row.usedAt || row.expiresAt <= new Date()) return null;

  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.passwordResetToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    }),
    prisma.consumerUser.update({
      where: { id: row.consumerUserId },
      data: { passwordHash },
    }),
  ]);

  return { id: row.consumerUser.id, email: row.consumerUser.email };
}
