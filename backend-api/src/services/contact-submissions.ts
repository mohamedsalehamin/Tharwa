import type { ContactSubmission, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

export type ContactSubmissionAdminItem = {
  id: string;
  name: string;
  email: string;
  subject: string | null;
  message: string;
  consumerUserId: string | null;
  consumerEmail: string | null;
  ip: string | null;
  createdAt: string;
};

export type CreateContactSubmissionInput = {
  name: string;
  email: string;
  subject?: string | null;
  message: string;
  consumerUserId?: string | null;
  ip?: string | null;
};

function toAdmin(row: ContactSubmission & { consumerUser?: { email: string } | null }): ContactSubmissionAdminItem {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    subject: row.subject,
    message: row.message,
    consumerUserId: row.consumerUserId,
    consumerEmail: row.consumerUser?.email ?? null,
    ip: row.ip,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function createContactSubmission(
  input: CreateContactSubmissionInput,
): Promise<ContactSubmissionAdminItem> {
  const row = await prisma.contactSubmission.create({
    data: {
      name: input.name,
      email: input.email,
      subject: input.subject ?? null,
      message: input.message,
      consumerUserId: input.consumerUserId ?? null,
      ip: input.ip ?? null,
    },
    include: { consumerUser: { select: { email: true } } },
  });
  return toAdmin(row);
}

export async function listContactSubmissionsAdmin(args: {
  limit: number;
  offset: number;
  email?: string;
}): Promise<{ items: ContactSubmissionAdminItem[]; total: number }> {
  const email = args.email?.trim();
  const where: Prisma.ContactSubmissionWhereInput | undefined = email
    ? { email: { contains: email, mode: 'insensitive' } }
    : undefined;

  const [rows, total] = await Promise.all([
    prisma.contactSubmission.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: args.limit,
      skip: args.offset,
      include: { consumerUser: { select: { email: true } } },
    }),
    prisma.contactSubmission.count({ where }),
  ]);

  return { items: rows.map(toAdmin), total };
}
