import type { Env } from '../config/env.js';
import { hashOpaqueToken, issueOpaqueToken } from '../lib/opaque-token.js';
import { prisma } from '../lib/prisma.js';

export type IssuedEmailVerification = {
  verificationToken: string;
  expiresAt: Date;
};

export async function issueEmailVerificationToken(
  env: Env,
  consumerUserId: string,
): Promise<IssuedEmailVerification> {
  await prisma.emailVerification.updateMany({
    where: { consumerUserId, verifiedAt: null },
    data: { verifiedAt: new Date() },
  });

  const verificationToken = issueOpaqueToken();
  const expiresAt = new Date(Date.now() + env.EMAIL_VERIFICATION_TOKEN_TTL_SEC * 1000);
  await prisma.emailVerification.create({
    data: {
      consumerUserId,
      tokenHash: hashOpaqueToken(verificationToken),
      expiresAt,
    },
  });
  return { verificationToken, expiresAt };
}

export async function verifyEmailWithToken(verificationToken: string): Promise<boolean> {
  const tokenHash = hashOpaqueToken(verificationToken);
  const row = await prisma.emailVerification.findUnique({
    where: { tokenHash },
  });
  if (!row || row.verifiedAt || row.expiresAt <= new Date()) return false;

  await prisma.$transaction([
    prisma.emailVerification.update({
      where: { id: row.id },
      data: { verifiedAt: new Date() },
    }),
    prisma.consumerUser.update({
      where: { id: row.consumerUserId },
      data: { emailVerifiedAt: new Date() },
    }),
  ]);
  return true;
}

export async function isConsumerEmailVerified(consumerUserId: string): Promise<boolean> {
  const user = await prisma.consumerUser.findUnique({
    where: { id: consumerUserId },
    select: { emailVerifiedAt: true },
  });
  return Boolean(user?.emailVerifiedAt);
}
