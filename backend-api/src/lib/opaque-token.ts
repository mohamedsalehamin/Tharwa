import { createHash, randomBytes } from 'node:crypto';

/** URL-safe opaque token for refresh / reset / verification flows. */
export function issueOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
