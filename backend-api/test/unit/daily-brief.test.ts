import { describe, expect, it } from 'vitest';
import { normalizeBriefLocale } from '../../src/services/brief-locale.js';
import { formatMarketBriefMessages } from '../../src/services/daily-brief.js';
import { formatWatchlistBriefMessages } from '../../src/services/watchlist-brief.js';

describe('normalizeBriefLocale', () => {
  it('defaults to Arabic', () => {
    expect(normalizeBriefLocale(null)).toBe('ar');
    expect(normalizeBriefLocale(undefined)).toBe('ar');
    expect(normalizeBriefLocale('fr')).toBe('ar');
  });

  it('accepts English', () => {
    expect(normalizeBriefLocale('en')).toBe('en');
  });
});

describe('formatMarketBriefMessages', () => {
  it('formats a full market brief in English', () => {
    const messages = formatMarketBriefMessages({
      dataAvailable: true,
      egx30: { value: 52164.6, changePct: -0.93 },
      topGainer: { symbol: 'KORA', changePct: 1385 },
      topLoser: { symbol: 'SMPP', changePct: -17.4 },
      usdEgp: { rate: 51.67, changePct: -0.1 },
    });
    expect(messages.en.title).toBe('Daily market brief');
    expect(messages.en.body).toContain('EGX 30: 52,164.60 (-0.9%)');
    expect(messages.en.body).toContain('Top gainer: KORA +1385.0%');
    expect(messages.en.body).toContain('Top loser: SMPP -17.4%');
    expect(messages.en.body).toContain('USD/EGP: 51.67 (-0.1%)');
  });

  it('formats Arabic copy', () => {
    const messages = formatMarketBriefMessages({
      dataAvailable: true,
      egx30: { value: 52164.6, changePct: -0.93 },
      topGainer: { symbol: 'KORA', changePct: 1385 },
      topLoser: { symbol: 'SMPP', changePct: -17.4 },
      usdEgp: { rate: 51.67, changePct: -0.1 },
    });
    expect(messages.ar.title).toBe('ملخص السوق اليومي');
    expect(messages.ar.body).toContain('أعلى رابح');
    expect(messages.ar.body).toContain('أعلى خاسر');
  });

  it('returns fallback when data is missing', () => {
    const messages = formatMarketBriefMessages({
      dataAvailable: false,
      egx30: null,
      topGainer: null,
      topLoser: null,
      usdEgp: null,
    });
    expect(messages.en.body).toContain('not available yet');
    expect(messages.ar.body).toContain('غير متاحة');
  });
});

describe('formatWatchlistBriefMessages', () => {
  it('summarizes watchlist movers', () => {
    const messages = formatWatchlistBriefMessages([
      { code: 'ADCI', changePct: -0.54 },
      { code: 'ADIB', changePct: -1.22 },
    ]);
    expect(messages).not.toBeNull();
    expect(messages!.en.title).toBe('Watchlist brief');
    expect(messages!.en.body).toContain('Watchlist avg: -0.88%');
    expect(messages!.en.body).toContain('Best: ADCI -0.54%');
    expect(messages!.en.body).toContain('Weakest: ADIB -1.22%');
    expect(messages!.ar.title).toBe('ملخص قائمة المتابعة');
  });

  it('returns null for empty rows', () => {
    expect(formatWatchlistBriefMessages([])).toBeNull();
  });
});
