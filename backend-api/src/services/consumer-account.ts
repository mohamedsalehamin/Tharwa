import { prisma } from '../lib/prisma.js';
import { verifyPassword } from './password.js';

export type DeleteConsumerAccountResult =
  | { ok: true }
  | { ok: false; code: 'NOT_FOUND' | 'NO_PASSWORD' | 'INVALID_PASSWORD' };

/** Permanently deletes the consumer and all cascaded personal data (watchlist, journal, sim, alerts, tokens). */
export async function deleteConsumerAccount(
  consumerUserId: string,
  password?: string,
): Promise<DeleteConsumerAccountResult> {
  const user = await prisma.consumerUser.findUnique({
    where: { id: consumerUserId },
    select: { id: true, passwordHash: true },
  });
  if (!user) {
    return { ok: false, code: 'NOT_FOUND' };
  }
  if (!user.passwordHash) {
    await prisma.consumerUser.delete({ where: { id: consumerUserId } });
    return { ok: true };
  }
  if (!password?.length) {
    return { ok: false, code: 'INVALID_PASSWORD' };
  }
  const passwordOk = await verifyPassword(password, user.passwordHash);
  if (!passwordOk) {
    return { ok: false, code: 'INVALID_PASSWORD' };
  }

  await prisma.consumerUser.delete({ where: { id: consumerUserId } });
  return { ok: true };
}
