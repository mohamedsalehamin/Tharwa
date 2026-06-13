import { prisma } from '../lib/prisma.js';
import {
  consumerUserPublicSelect,
  normalizeDisplayName,
  toConsumerUserPublic,
  type ConsumerUserPublic,
} from './consumer-user.js';
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

export type SocialSignInOptions = {
  displayName?: string;
};

function resolvedDisplayName(raw?: string): string | undefined {
  if (!raw?.trim()) return undefined;
  const name = normalizeDisplayName(raw);
  return name.length >= 1 ? name : undefined;
}

export async function signInWithSocialIdentity(
  identity: VerifiedSocialIdentity,
  options?: SocialSignInOptions,
): Promise<ConsumerUserPublic> {
  const authSubject = formatAuthSubject(identity.provider, identity.sub);
  const incomingName = resolvedDisplayName(options?.displayName);

  const bySubject = await prisma.consumerUser.findFirst({
    where: { authSubject },
    select: consumerUserPublicSelect,
  });
  if (bySubject) {
    if (incomingName && !bySubject.displayName) {
      const updated = await prisma.consumerUser.update({
        where: { id: bySubject.id },
        data: { displayName: incomingName },
        select: consumerUserPublicSelect,
      });
      return toConsumerUserPublic(updated);
    }
    return toConsumerUserPublic(bySubject);
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
    select: {
      ...consumerUserPublicSelect,
      authSubject: true,
      emailVerifiedAt: true,
    },
  });

  if (byEmail) {
    if (byEmail.authSubject && byEmail.authSubject !== authSubject) {
      throw new SocialAuthError(
        'ACCOUNT_CONFLICT',
        'This email is registered with a different sign-in method',
      );
    }
    const updated = await prisma.consumerUser.update({
      where: { id: byEmail.id },
      data: {
        authSubject,
        displayName: byEmail.displayName ?? incomingName ?? null,
        emailVerifiedAt:
          identity.emailVerified && !byEmail.emailVerifiedAt ? new Date() : byEmail.emailVerifiedAt,
      },
      select: consumerUserPublicSelect,
    });
    return toConsumerUserPublic(updated);
  }

  const created = await prisma.consumerUser.create({
    data: {
      email,
      authSubject,
      displayName: incomingName ?? null,
      emailVerifiedAt: identity.emailVerified ? new Date() : null,
    },
    select: consumerUserPublicSelect,
  });
  return toConsumerUserPublic(created);
}
