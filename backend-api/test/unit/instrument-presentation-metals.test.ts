import { beforeEach, describe, expect, it, vi } from 'vitest';
import { METAL_QUOTE_INSTRUMENT_CODES } from '../../src/lib/metal-instrument-codes.js';
import type { MetalItem } from '../../src/services/connectors/metals.js';

const mockFindFirst = vi.fn();
const mockFindMany = vi.fn();
const mockAccess = vi.fn();

vi.mock('node:fs/promises', () => ({
  access: (...args: unknown[]) => mockAccess(...args),
}));

vi.mock('../../src/lib/prisma.js', () => ({
  prisma: {
    instrument: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

const { applyMetalsPresentation } = await import('../../src/services/instrument-presentation.js');

const env = {
  METALS_GOLD_INSTRUMENT_CODE: 'GOLD_EGP',
  PUBLIC_UPLOADS_DIR: '/tmp/tharwa-uploads',
  PUBLIC_FILES_ORIGIN: 'https://api.test',
} as never;

describe('applyMetalsPresentation metal flags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAccess.mockRejectedValue(new Error('ENOENT'));
    mockFindFirst.mockImplementation(({ where }: { where?: { code?: string } }) => {
      if (where?.code === 'GOLD_EGP') {
        return Promise.resolve({
          isConsumerVisible: true,
          metadata: { flagUrl: 'https://api.test/files/metal-flags/GOLD_EGP.png' },
        });
      }
      if (where?.code === 'SILVER_EGP') {
        return Promise.resolve({ isConsumerVisible: true, metadata: null });
      }
      return Promise.resolve(null);
    });
    mockFindMany.mockResolvedValue([
      {
        code: METAL_QUOTE_INSTRUMENT_CODES.GOLD_POUND,
        metadata: { flagUrl: 'https://api.test/files/metal-flags/GOLD_POUND_EGP.png' },
      },
    ]);
  });

  it('uses per-instrument flag for gold pound when uploaded', async () => {
    const items: MetalItem[] = [
      {
        metal: 'gold',
        unit: 'gram',
        karat: 21,
        amountEgp: 6040,
        asOf: '2026-06-20T12:00:00.000Z',
        quoteCategory: 'indicative',
        sessionState: 'unknown',
        isStale: false,
      },
      {
        metal: 'gold',
        unit: 'gold_pound',
        karat: 21,
        amountEgp: 48320,
        asOf: '2026-06-20T12:00:00.000Z',
        quoteCategory: 'indicative',
        sessionState: 'unknown',
        isStale: false,
      },
    ];

    const out = await applyMetalsPresentation(env, items);
    expect(out[0]?.flagUrl).toBe('https://api.test/files/metal-flags/GOLD_EGP.png');
    expect(out[1]?.flagUrl).toBe('https://api.test/files/metal-flags/GOLD_POUND_EGP.png');
  });

  it('falls back to uploaded file on disk when metadata has no flagUrl', async () => {
    mockFindMany.mockResolvedValue([
      { code: METAL_QUOTE_INSTRUMENT_CODES.GOLD_POUND, metadata: null },
    ]);
    mockAccess.mockImplementation(async (diskPath: string) => {
      if (String(diskPath).endsWith('GOLD_POUND_EGP.png')) return undefined;
      throw new Error('ENOENT');
    });

    const items: MetalItem[] = [
      {
        metal: 'gold',
        unit: 'gold_pound',
        karat: 21,
        amountEgp: 48320,
        asOf: '2026-06-20T12:00:00.000Z',
        quoteCategory: 'indicative',
        sessionState: 'unknown',
        isStale: false,
      },
    ];

    const out = await applyMetalsPresentation(env, items);
    expect(out[0]?.flagUrl).toBe('https://api.test/files/metal-flags/GOLD_POUND_EGP.png');
  });
});
