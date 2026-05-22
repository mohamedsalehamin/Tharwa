import { SignJWT, jwtVerify } from 'jose';
import type { Env } from '../config/env.js';

export type ConsumerJwtPayload = { sub: string; email: string };

function secretKey(env: Env): Uint8Array {
  return new TextEncoder().encode(env.CONSUMER_JWT_SECRET);
}

export async function signConsumerAccessToken(env: Env, payload: ConsumerJwtPayload): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + env.CONSUMER_ACCESS_TOKEN_TTL_SEC;
  return new SignJWT({ email: payload.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setExpirationTime(exp)
    .setIssuedAt()
    .sign(secretKey(env));
}

export async function verifyConsumerAccessToken(env: Env, token: string): Promise<ConsumerJwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(env));
    const sub = payload.sub;
    if (!sub || typeof sub !== 'string') return null;
    const email = typeof payload.email === 'string' ? payload.email : '';
    return { sub, email };
  } catch {
    return null;
  }
}
