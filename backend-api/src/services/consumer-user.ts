import { prisma } from '../lib/prisma.js';

export type ConsumerUserPublic = {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
};

export const consumerUserPublicSelect = {
  id: true,
  email: true,
  displayName: true,
  phone: true,
} as const;

export function toConsumerUserPublic(row: {
  id: string;
  email: string;
  displayName: string | null;
  phone: string | null;
}): ConsumerUserPublic {
  return {
    id: row.id,
    email: row.email,
    name: row.displayName,
    phone: row.phone,
  };
}

export async function getConsumerUserPublic(userId: string): Promise<ConsumerUserPublic | null> {
  const row = await prisma.consumerUser.findUnique({
    where: { id: userId },
    select: consumerUserPublicSelect,
  });
  return row ? toConsumerUserPublic(row) : null;
}

export function normalizeDisplayName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/[^\d+]/g, '');
  if (digits.length < 8 || digits.length > 20) {
    throw new Error('Invalid phone number');
  }
  return digits;
}

export type UpdateConsumerProfileInput = {
  name?: string | null;
  phone?: string | null;
};

export async function updateConsumerProfile(
  userId: string,
  input: UpdateConsumerProfileInput,
): Promise<ConsumerUserPublic | null> {
  const data: { displayName?: string | null; phone?: string | null } = {};
  if (input.name !== undefined) {
    if (input.name === null || input.name === '') {
      data.displayName = null;
    } else {
      const name = normalizeDisplayName(input.name);
      if (name.length < 1 || name.length > 120) throw new Error('Invalid name');
      data.displayName = name;
    }
  }
  if (input.phone !== undefined) {
    if (input.phone === null || input.phone === '') {
      data.phone = null;
    } else {
      data.phone = normalizePhone(input.phone);
    }
  }
  if (Object.keys(data).length === 0) {
    return getConsumerUserPublic(userId);
  }
  const row = await prisma.consumerUser.update({
    where: { id: userId },
    data,
    select: consumerUserPublicSelect,
  });
  return toConsumerUserPublic(row);
}
