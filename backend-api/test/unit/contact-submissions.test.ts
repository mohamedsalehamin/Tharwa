import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  contactSubmission: {
    create: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  },
}));

vi.mock('../../src/lib/prisma.js', () => ({
  prisma: prismaMock,
}));

import {
  createContactSubmission,
  listContactSubmissionsAdmin,
} from '../../src/services/contact-submissions.js';

describe('contact-submissions service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a submission and maps admin fields', async () => {
    const createdAt = new Date('2026-05-23T12:00:00.000Z');
    prismaMock.contactSubmission.create.mockResolvedValue({
      id: 'sub-1',
      name: 'Sara',
      email: 'sara@example.com',
      subject: 'Help',
      message: 'Hello',
      consumerUserId: null,
      ip: '127.0.0.1',
      createdAt,
      consumerUser: null,
    });

    const item = await createContactSubmission({
      name: 'Sara',
      email: 'sara@example.com',
      subject: 'Help',
      message: 'Hello',
      ip: '127.0.0.1',
    });

    expect(item).toMatchObject({
      id: 'sub-1',
      name: 'Sara',
      email: 'sara@example.com',
      subject: 'Help',
      message: 'Hello',
      consumerEmail: null,
      createdAt: createdAt.toISOString(),
    });
  });

  it('lists submissions with total', async () => {
    prismaMock.contactSubmission.findMany.mockResolvedValue([]);
    prismaMock.contactSubmission.count.mockResolvedValue(0);

    const result = await listContactSubmissionsAdmin({ limit: 10, offset: 0 });
    expect(result).toEqual({ items: [], total: 0 });
  });
});
