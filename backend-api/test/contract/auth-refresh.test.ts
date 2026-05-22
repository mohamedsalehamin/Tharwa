import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashOpaqueToken } from '../../src/lib/opaque-token.js';
import { buildTestApp } from '../helpers/build-test-app.js';

type RefreshRow = {
  id: string;
  consumerUserId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  consumerUser: { id: string; email: string };
};

const store = new Map<string, RefreshRow>();
const userId = randomUUID();
let plainRefresh = '';

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
          consumerUser: { id: data.consumerUserId, email: 'rotate@test.local' },
        };
        store.set(data.tokenHash, row);
        return row;
      }),
      findUnique: vi.fn(async ({ where }: { where: { tokenHash: string } }) => store.get(where.tokenHash) ?? null),
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

describe('POST /v1/auth/refresh', () => {
  let close: (() => Promise<void>) | undefined;

  beforeEach(() => {
    store.clear();
    plainRefresh = `test-refresh-${randomUUID()}`;
    const tokenHash = hashOpaqueToken(plainRefresh);
    store.set(tokenHash, {
      id: randomUUID(),
      consumerUserId: userId,
      tokenHash,
      expiresAt: new Date(Date.now() + 86400_000),
      revokedAt: null,
      consumerUser: { id: userId, email: 'rotate@test.local' },
    });
  });

  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  it('returns new access + refresh tokens and invalidates old refresh', async () => {
    const t = await buildTestApp();
    close = t.close;

    const res = await t.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: plainRefresh },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      accessToken: string;
      refreshToken: string;
      user: { id: string; email: string };
    };
    expect(body.accessToken.length).toBeGreaterThan(10);
    expect(body.refreshToken).not.toBe(plainRefresh);
    expect(body.user.id).toBe(userId);

    const oldHash = hashOpaqueToken(plainRefresh);
    expect(store.get(oldHash)?.revokedAt).not.toBeNull();

    const replay = await t.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: plainRefresh },
    });
    expect(replay.statusCode).toBe(401);
  });
});
