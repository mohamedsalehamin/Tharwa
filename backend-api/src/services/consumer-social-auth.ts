import { prisma } from '../lib/prisma.js';
import type { SocialProvider, VerifiedSocialIdentity } from './social-id-token.js';

export class SocialAuthError extends Error {
  constructor(
    readonly code: 'EMAIL_REQUIRED' | 'ACCOUNT_CONFLICT' | 'INVALID_PROVIDER',
    message: string,
  ) {
    super(message);
    this.name = 'SocialAuthError';
  }
}

export function formatAuthSubject(provider: SocialProvider, sub: string): string {
  return `${provider}:${sub}`;
}

export async function signInWithSocialIdentity(
  identity: VerifiedSocialIdentity,
): Promise<{ id: string; email: string }> {
  const authSubject = formatAuthSubject(identity.provider, identity.sub);

  const bySubject = await prisma.consumerUser.findFirst({
    where: { authSubject },
    select: { id: true, email: true },
  });
  if (bySubject) {
    return bySubject;
  }

  const email = identity.email?.trim().toLowerCase();
  if (!email) {
    throw new SocialAuthError(
      'EMAIL_REQUIRED',
      'Sign in with Apple again and share your email, or use Google sign-in',
    );
  }

  const byEmail = await prisma.consumerUser.findUnique({
    where: { email },
    select: { id: true, email: true, authSubject: true, emailVerifiedAt: true },
  });

  if (byEmail) {
    if (byEmail.authSubject && byEmail.authSubject !== authSubject) {
      throw new SocialAuthError(
        'ACCOUNT_CONFLICT',
        'This email is registered with a different sign-in method',
      );
    }
    return prisma.consumerUser.update({
      where: { id: byEmail.id },
      data: {
        authSubject,
        emailVerifiedAt:
          identity.emailVerified && !byEmail.emailVerifiedAt ? new Date() : byEmail.emailVerifiedAt,
      },
      select: { id: true, email: true },
    });
  }

  return prisma.consumerUser.create({
    data: {
      email,
      authSubject,
      emailVerifiedAt: identity.emailVerified ? new Date() : null,
    },
    select: { id: true, email: true },
  });
}
