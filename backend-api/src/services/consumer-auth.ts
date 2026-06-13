import { prisma } from '../lib/prisma.js';
import {
  consumerUserPublicSelect,
  normalizeDisplayName,
  normalizePhone,
  toConsumerUserPublic,
  type ConsumerUserPublic,
} from './consumer-user.js';
import { hashPassword, verifyPassword } from './password.js';

export type RegisterResult =
  | { ok: true; user: ConsumerUserPublic }
  | { ok: false; code: 'EMAIL_IN_USE' };

export async function registerConsumerWithPassword(
  emailRaw: string,
  password: string,
  nameRaw: string,
  phoneRaw: string,
): Promise<RegisterResult> {
  const email = emailRaw.trim().toLowerCase();
  const displayName = normalizeDisplayName(nameRaw);
  const phone = normalizePhone(phoneRaw);
  const existing = await prisma.consumerUser.findUnique({ where: { email } });
  if (existing) {
    return { ok: false, code: 'EMAIL_IN_USE' };
  }
  const passwordHash = await hashPassword(password);
  const user = await prisma.consumerUser.create({
    data: { email, passwordHash, displayName, phone },
    select: consumerUserPublicSelect,
  });
  return { ok: true, user: toConsumerUserPublic(user) };
}

export async function verifyConsumerPasswordLogin(
  emailRaw: string,
  password: string,
): Promise<ConsumerUserPublic | null> {
  const email = emailRaw.trim().toLowerCase();
  const user = await prisma.consumerUser.findUnique({
    where: { email },
    select: { ...consumerUserPublicSelect, passwordHash: true },
  });
  if (!user?.passwordHash) return null;
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return null;
  const { passwordHash: _, ...publicRow } = user;
  return toConsumerUserPublic(publicRow);
}
