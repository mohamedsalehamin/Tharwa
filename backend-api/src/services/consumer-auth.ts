import { prisma } from '../lib/prisma.js';
import { hashPassword, verifyPassword } from './password.js';

export type RegisterResult =
  | { ok: true; id: string; email: string }
  | { ok: false; code: 'EMAIL_IN_USE' };

export async function registerConsumerWithPassword(
  emailRaw: string,
  password: string,
): Promise<RegisterResult> {
  const email = emailRaw.trim().toLowerCase();
  const existing = await prisma.consumerUser.findUnique({ where: { email } });
  if (existing) {
    return { ok: false, code: 'EMAIL_IN_USE' };
  }
  const passwordHash = await hashPassword(password);
  const user = await prisma.consumerUser.create({
    data: { email, passwordHash },
    select: { id: true, email: true },
  });
  return { ok: true, ...user };
}

export async function verifyConsumerPasswordLogin(
  emailRaw: string,
  password: string,
): Promise<{ id: string; email: string } | null> {
  const email = emailRaw.trim().toLowerCase();
  const user = await prisma.consumerUser.findUnique({ where: { email } });
  if (!user?.passwordHash) return null;
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return null;
  return { id: user.id, email: user.email };
}
