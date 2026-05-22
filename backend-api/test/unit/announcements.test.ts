import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rows: Array<{
  id: string;
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
  variant: 'info' | 'warning' | 'maintenance';
  sortOrder: number;
  isEnabled: boolean;
  dismissible: boolean;
  linkUrl: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}> = [];

vi.mock('../../src/lib/prisma.js', () => ({
  prisma: {
    consumerAnnouncement: {
      findMany: vi.fn(async ({ where }: { where?: Record<string, unknown> }) => {
        const now = new Date('2026-05-21T12:00:00Z');
        if (where && 'isEnabled' in where) {
          return rows.filter((r) => {
            if (!r.isEnabled) return false;
            if (r.startsAt && r.startsAt > now) return false;
            if (r.endsAt && r.endsAt < now) return false;
            return true;
          });
        }
        return [...rows];
      }),
    },
  },
}));

const { listActiveAnnouncements } = await import('../../src/services/announcements.js');

describe('listActiveAnnouncements', () => {
  beforeEach(() => {
    rows.length = 0;
    rows.push({
      id: randomUUID(),
      titleAr: 'نشط',
      titleEn: 'Active',
      bodyAr: 'نص',
      bodyEn: 'Body',
      variant: 'info',
      sortOrder: 0,
      isEnabled: true,
      dismissible: true,
      linkUrl: null,
      startsAt: null,
      endsAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    rows.push({
      id: randomUUID(),
      titleAr: 'منتهي',
      titleEn: 'Expired',
      bodyAr: 'نص',
      bodyEn: 'Body',
      variant: 'warning',
      sortOrder: 1,
      isEnabled: true,
      dismissible: true,
      linkUrl: null,
      startsAt: null,
      endsAt: new Date('2026-05-20T00:00:00Z'),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    rows.push({
      id: randomUUID(),
      titleAr: 'معطل',
      titleEn: 'Disabled',
      bodyAr: 'نص',
      bodyEn: 'Body',
      variant: 'maintenance',
      sortOrder: 2,
      isEnabled: false,
      dismissible: false,
      linkUrl: null,
      startsAt: null,
      endsAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it('returns only enabled announcements within schedule window', async () => {
    const items = await listActiveAnnouncements(new Date('2026-05-21T12:00:00Z'));
    expect(items).toHaveLength(1);
    expect(items[0]?.titleEn).toBe('Active');
  });
});
