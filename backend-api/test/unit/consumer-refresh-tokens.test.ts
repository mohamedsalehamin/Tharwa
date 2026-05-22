import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashOpaqueToken } from '../../src/lib/opaque-token.js';
import { createTestEnv } from '../helpers/test-env.js';

type RefreshRow = {
  id: string;
  consumerUserId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  consumerUser: { id: string; email: string };
};

const store = new Map<string, RefreshRow>();

vi.mock('../../src/lib/prisma.js', () => ({
  prisma: {
    consumerRefreshToken: {
      create: vi.fn(async ({ data }: { data: { consumerUserId: string; tokenHash: string; expiresAt: Date } }) => {
        const id = randomUUID();
        const row: RefreshRow = {
          id,
          consumerUserId: data.consumerUserId,
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
          revokedAt: null,
          consumerUser: { id: data.consumerUserId, email: 'user@test.local' },
        };
        store.set(data.tokenHash, row);
        return row;
      }),
      findUnique: vi.fn(async ({ where }: { where: { tokenHash: string } }) => {
        return store.get(where.tokenHash) ?? null;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { revokedAt: Date } }) => {
        const row = [...store.values()].find((r) => r.id === where.id);
        if (!row) throw new Error('not found');
        row.revokedAt = data.revokedAt;
        return row;
      }),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
  },
}));

const {
  issueConsumerRefreshToken,
  rotateConsumerRefreshToken,
  revokeConsumerRefreshToken,
} = await import('../../src/services/consumer-refresh-tokens.js');

describe('consumer refresh tokens', () => {
  const env = createTestEnv();

  beforeEach(() => {
    store.clear();
  });

  it('rotates refresh token and revokes the old hash', async () => {
    const userId = randomUUID();
    const issued = await issueConsumerRefreshToken(env, userId);
    const rotated = await rotateConsumerRefreshToken(env, issued.refreshToken);
    expect(rotated).not.toBeNull();
    expect(rotated!.userId).toBe(userId);
    expect(rotated!.newRefreshToken).not.toBe(issued.refreshToken);

    const oldHash = hashOpaqueToken(issued.refreshToken);
    expect(store.get(oldHash)?.revokedAt).not.toBeNull();

    const second = await rotateConsumerRefreshToken(env, issued.refreshToken);
    expect(second).toBeNull();
  });

  it('revokes a refresh token', async () => {
    const userId = randomUUID();
    const issued = await issueConsumerRefreshToken(env, userId);
    const ok = await revokeConsumerRefreshToken(issued.refreshToken);
    expect(ok).toBe(true);
    const rotated = await rotateConsumerRefreshToken(env, issued.refreshToken);
    expect(rotated).toBeNull();
  });
});
