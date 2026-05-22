import { SignJWT, jwtVerify } from 'jose';
import type { Env } from '../config/env.js';

export type AdminJwtPayload = { sub: string; email: string; role: string };

function secretKey(env: Env): Uint8Array {
  return new TextEncoder().encode(env.ADMIN_JWT_SECRET);
}

export async function signAdminAccessToken(env: Env, payload: AdminJwtPayload): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + env.ADMIN_ACCESS_TOKEN_TTL_SEC;
  return new SignJWT({ role: payload.role, email: payload.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setExpirationTime(exp)
    .setIssuedAt()
    .sign(secretKey(env));
}

export async function verifyAdminAccessToken(env: Env, token: string): Promise<AdminJwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(env));
    const sub = payload.sub;
    if (!sub || typeof sub !== 'string') return null;
    const role = typeof payload.role === 'string' ? payload.role : 'operator';
    const email = typeof payload.email === 'string' ? payload.email : '';
    return { sub, role, email };
  } catch {
    return null;
  }
}
