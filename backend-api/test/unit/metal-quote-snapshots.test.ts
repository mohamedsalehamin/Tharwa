import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QuoteCategory, SessionState } from '@prisma/client';
import { METAL_QUOTE_INSTRUMENT_CODES } from '../../src/lib/metal-instrument-codes.js';
import type { MetalItem } from '../../src/services/connectors/metals.js';

const mockFindMany = vi.fn();
const mockCreate = vi.fn();
const mockQueryRaw = vi.fn();

vi.mock('../../src/lib/prisma.js', () => ({
  prisma: {
    instrument: { findMany: (...args: unknown[]) => mockFindMany(...args) },
    quoteSnapshot: { create: (...args: unknown[]) => mockCreate(...args) },
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
  },
}));

const {
  getLatestMetalQuotesFromDb,
  persistMetalQuoteSnapshots,
  resetMetalInstrumentIdMapCache,
} = await import('../../src/services/metal-quote-snapshots.js');

const instrumentRows = [
  { id: 'id-24k', code: METAL_QUOTE_INSTRUMENT_CODES.GOLD_24K_GRAM },
  { id: 'id-21k', code: METAL_QUOTE_INSTRUMENT_CODES.GOLD_21K_GRAM },
  { id: 'id-pound', code: METAL_QUOTE_INSTRUMENT_CODES.GOLD_POUND },
  { id: 'id-18k', code: METAL_QUOTE_INSTRUMENT_CODES.GOLD_18K_GRAM },
  { id: 'id-oz', code: METAL_QUOTE_INSTRUMENT_CODES.GOLD_TROY_OZ },
  { id: 'id-silver', code: METAL_QUOTE_INSTRUMENT_CODES.SILVER_GRAM },
];

function sampleItems(asOf = '2026-06-09T12:00:00.000Z'): MetalItem[] {
  const base = {
    asOf,
    quoteCategory: 'indicative' as const,
    sessionState: 'unknown' as const,
    isStale: false,
  };
  return [
    { ...base, metal: 'gold', unit: 'gram', karat: 24, amountEgp: 7789 },
    { ...base, metal: 'gold', unit: 'gram', karat: 21, amountEgp: 6815 },
    { ...base, metal: 'gold', unit: 'gold_pound', karat: 21, amountEgp: 54_520 },
    { ...base, metal: 'gold', unit: 'gram', karat: 18, amountEgp: 5841 },
    { ...base, metal: 'gold', unit: 'troy_ounce', karat: null, amountEgp: 242_000 },
    { ...base, metal: 'silver', unit: 'gram', karat: null, amountEgp: 132 },
  ];
}

describe('metal quote snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMetalInstrumentIdMapCache();
    mockFindMany.mockResolvedValue(instrumentRows);
    mockCreate.mockResolvedValue({ id: 'snap-1' });
  });

  it('returns null when sub-instruments are not seeded', async () => {
    mockFindMany.mockResolvedValue([]);
    await expect(getLatestMetalQuotesFromDb()).resolves.toBeNull();
  });

  it('reads latest snapshot per instrument into MetalItem rows', async () => {
    mockQueryRaw.mockResolvedValue([
      {
        instrumentId: 'id-24k',
        asOf: new Date('2026-06-09T12:00:00.000Z'),
        last: { toNumber: () => 7789 },
        quoteCategory: QuoteCategory.indicative,
        sessionState: SessionState.unknown,
        raw: null,
      },
      {
        instrumentId: 'id-21k',
        asOf: new Date('2026-06-09T12:00:00.000Z'),
        last: { toNumber: () => 6815 },
        quoteCategory: QuoteCategory.indicative,
        sessionState: SessionState.unknown,
        raw: null,
      },
      {
        instrumentId: 'id-pound',
        asOf: new Date('2026-06-09T12:00:00.000Z'),
        last: { toNumber: () => 54_520 },
        quoteCategory: QuoteCategory.indicative,
        sessionState: SessionState.unknown,
        raw: null,
      },
      {
        instrumentId: 'id-18k',
        asOf: new Date('2026-06-09T12:00:00.000Z'),
        last: { toNumber: () => 5841 },
        quoteCategory: QuoteCategory.indicative,
        sessionState: SessionState.unknown,
        raw: null,
      },
      {
        instrumentId: 'id-oz',
        asOf: new Date('2026-06-09T12:00:00.000Z'),
        last: { toNumber: () => 242_000 },
        quoteCategory: QuoteCategory.indicative,
        sessionState: SessionState.unknown,
        raw: null,
      },
      {
        instrumentId: 'id-silver',
        asOf: new Date('2026-06-09T12:00:00.000Z'),
        last: { toNumber: () => 132 },
        quoteCategory: QuoteCategory.indicative,
        sessionState: SessionState.unknown,
        raw: null,
      },
    ]);

    const result = await getLatestMetalQuotesFromDb();
    expect(result).not.toBeNull();
    expect(result!.items).toHaveLength(6);
    expect(result!.items.find((i) => i.unit === 'gold_pound')?.amountEgp).toBe(54_520);
    expect(result!.bundleFetchedAt).toBe('2026-06-09T12:00:00.000Z');
  });

  it('persists one QuoteSnapshot per metal row', async () => {
    mockQueryRaw.mockResolvedValue([]);

    const result = await persistMetalQuoteSnapshots(sampleItems(), { dedupMinIntervalSec: 0 });
    expect(result.skipped).toBe(false);
    expect(result.inserted).toBe(6);
    expect(mockCreate).toHaveBeenCalledTimes(6);
    expect(mockCreate.mock.calls[1][0].data.instrumentId).toBe('id-21k');
    expect(mockCreate.mock.calls[1][0].data.last.toNumber()).toBe(6815);
  });

  it('skips insert when prices are unchanged within dedup window', async () => {
    const now = new Date();
    mockQueryRaw.mockResolvedValue([
      {
        instrumentId: 'id-24k',
        asOf: now,
        last: { toNumber: () => 7789 },
        quoteCategory: QuoteCategory.indicative,
        sessionState: SessionState.unknown,
        raw: null,
      },
      {
        instrumentId: 'id-21k',
        asOf: now,
        last: { toNumber: () => 6815 },
        quoteCategory: QuoteCategory.indicative,
        sessionState: SessionState.unknown,
        raw: null,
      },
      {
        instrumentId: 'id-pound',
        asOf: now,
        last: { toNumber: () => 54_520 },
        quoteCategory: QuoteCategory.indicative,
        sessionState: SessionState.unknown,
        raw: null,
      },
      {
        instrumentId: 'id-18k',
        asOf: now,
        last: { toNumber: () => 5841 },
        quoteCategory: QuoteCategory.indicative,
        sessionState: SessionState.unknown,
        raw: null,
      },
      {
        instrumentId: 'id-oz',
        asOf: now,
        last: { toNumber: () => 242_000 },
        quoteCategory: QuoteCategory.indicative,
        sessionState: SessionState.unknown,
        raw: null,
      },
      {
        instrumentId: 'id-silver',
        asOf: now,
        last: { toNumber: () => 132 },
        quoteCategory: QuoteCategory.indicative,
        sessionState: SessionState.unknown,
        raw: null,
      },
    ]);

    const result = await persistMetalQuoteSnapshots(sampleItems(now.toISOString()), {
      dedupMinIntervalSec: 300,
    });
    expect(result.skipped).toBe(true);
    expect(result.inserted).toBe(0);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
