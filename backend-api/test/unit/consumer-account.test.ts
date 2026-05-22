import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashPassword } from '../../src/services/password.js';

const userId = randomUUID();
let passwordHash = '';

const prismaMock = {
  consumerUser: {
    findUnique: vi.fn(),
    delete: vi.fn(),
  },
};

vi.mock('../../src/lib/prisma.js', () => ({
  prisma: prismaMock,
}));

const { deleteConsumerAccount } = await import('../../src/services/consumer-account.js');

describe('deleteConsumerAccount', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    passwordHash = await hashPassword('correct-pass');
    prismaMock.consumerUser.findUnique.mockResolvedValue({
      id: userId,
      passwordHash,
    });
    prismaMock.consumerUser.delete.mockResolvedValue({ id: userId });
  });

  it('deletes user when password matches', async () => {
    const result = await deleteConsumerAccount(userId, 'correct-pass');
    expect(result).toEqual({ ok: true });
    expect(prismaMock.consumerUser.delete).toHaveBeenCalledWith({ where: { id: userId } });
  });

  it('rejects wrong password', async () => {
    const result = await deleteConsumerAccount(userId, 'wrong-pass');
    expect(result).toEqual({ ok: false, code: 'INVALID_PASSWORD' });
    expect(prismaMock.consumerUser.delete).not.toHaveBeenCalled();
  });

  it('returns NOT_FOUND when user missing', async () => {
    prismaMock.consumerUser.findUnique.mockResolvedValue(null);
    const result = await deleteConsumerAccount(userId, 'correct-pass');
    expect(result).toEqual({ ok: false, code: 'NOT_FOUND' });
  });

  it('returns NO_PASSWORD when account has no password hash', async () => {
    prismaMock.consumerUser.findUnique.mockResolvedValue({ id: userId, passwordHash: null });
    const result = await deleteConsumerAccount(userId, 'correct-pass');
    expect(result).toEqual({ ok: false, code: 'NO_PASSWORD' });
  });
});
