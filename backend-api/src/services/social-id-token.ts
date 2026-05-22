import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

export type SocialProvider = 'google' | 'apple';

export type VerifiedSocialIdentity = {
  provider: SocialProvider;
  sub: string;
  email?: string;
  emailVerified: boolean;
};

export class SocialTokenError extends Error {
  constructor(
    readonly code: 'INVALID_TOKEN' | 'MISSING_EMAIL',
    message: string,
  ) {
    super(message);
    this.name = 'SocialTokenError';
  }
}

const googleJwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const appleJwks = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

function readEmail(payload: JWTPayload): string | undefined {
  if (typeof payload.email !== 'string' || !payload.email.trim()) return undefined;
  return payload.email.trim().toLowerCase();
}

function readEmailVerified(payload: JWTPayload): boolean {
  return payload.email_verified === true;
}

export async function verifyGoogleIdToken(
  idToken: string,
  clientIds: string[],
): Promise<VerifiedSocialIdentity> {
  if (clientIds.length === 0) {
    throw new SocialTokenError('INVALID_TOKEN', 'Google OAuth is not configured');
  }
  try {
    const { payload } = await jwtVerify(idToken, googleJwks, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: clientIds,
    });
    const sub = payload.sub;
    if (!sub) throw new SocialTokenError('INVALID_TOKEN', 'Missing subject');
    const email = readEmail(payload);
    if (!email) throw new SocialTokenError('MISSING_EMAIL', 'Google account has no email');
    return {
      provider: 'google',
      sub,
      email,
      emailVerified: readEmailVerified(payload),
    };
  } catch (e) {
    if (e instanceof SocialTokenError) throw e;
    throw new SocialTokenError('INVALID_TOKEN', 'Invalid Google ID token');
  }
}

export async function verifyAppleIdToken(
  idToken: string,
  clientIds: string[],
): Promise<VerifiedSocialIdentity> {
  if (clientIds.length === 0) {
    throw new SocialTokenError('INVALID_TOKEN', 'Apple Sign In is not configured');
  }
  try {
    const { payload } = await jwtVerify(idToken, appleJwks, {
      issuer: 'https://appleid.apple.com',
      audience: clientIds,
    });
    const sub = payload.sub;
    if (!sub) throw new SocialTokenError('INVALID_TOKEN', 'Missing subject');
    return {
      provider: 'apple',
      sub,
      email: readEmail(payload),
      emailVerified: readEmailVerified(payload),
    };
  } catch (e) {
    if (e instanceof SocialTokenError) throw e;
    throw new SocialTokenError('INVALID_TOKEN', 'Invalid Apple ID token');
  }
}
