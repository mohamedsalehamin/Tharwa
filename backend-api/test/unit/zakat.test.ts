import { describe, expect, it } from 'vitest';
import type { MetalItem } from '../../src/services/connectors/metals.js';
import {
  NISAB_GOLD_GRAMS,
  ZAKAT_RATE_GREGORIAN,
  ZAKAT_RATE_HIJRI,
  buildNisabFromMetals,
  computeZakat,
} from '../../src/services/zakat.js';

const AS_OF = '2026-05-01T12:00:00.000Z';

function metalRow(
  metal: 'gold' | 'silver',
  unit: 'gram' | 'troy_ounce',
  karat: 18 | 21 | 24 | null,
  amountEgp: number,
): MetalItem {
  return {
    metal,
    unit,
    karat,
    amountEgp,
    asOf: AS_OF,
    isStale: false,
    quoteCategory: 'indicative',
    sessionState: 'unknown',
  };
}

const SAMPLE_METALS: MetalItem[] = [
  metalRow('gold', 'gram', 24, 4000),
  metalRow('gold', 'gram', 21, 3500),
  metalRow('gold', 'gram', 18, 3000),
  metalRow('silver', 'gram', null, 45),
];

describe('buildNisabFromMetals', () => {
  it('computes nisab as 85 × 21k gram price', () => {
    const nisab = buildNisabFromMetals(SAMPLE_METALS);
    expect(nisab).not.toBeNull();
    expect(nisab!.nisabEgp).toBe(85 * 3500);
    expect(nisab!.gold21GramPriceEgp).toBe(3500);
    expect(nisab!.nisabGoldGrams).toBe(NISAB_GOLD_GRAMS);
  });

  it('returns null without 21k gold row', () => {
    expect(buildNisabFromMetals([metalRow('gold', 'gram', 24, 4000)])).toBeNull();
  });
});

describe('computeZakat', () => {
  const nisab = buildNisabFromMetals(SAMPLE_METALS)!;

  it('excludes personal jewelry gold from zakatable total', () => {
    const r = computeZakat(
      {
        yearType: 'hijri',
        cashEgp: nisab.nisabEgp + 500_000,
        equitiesEgp: 0,
        gold: { mode: 'egp', amount: 100_000, purpose: 'personal_jewelry' },
        bankCertificatesEgp: 0,
        realEstateEgp: 0,
        commercialAssetsEgp: 0,
        receivablesEgp: 0,
        debtsOwedEgp: 0,
      },
      SAMPLE_METALS,
      nisab,
    );
    expect(r.breakdown.goldGrossEgp).toBe(100_000);
    expect(r.breakdown.goldEgp).toBe(0);
    expect(r.purposeNotes.some((n) => n.id === 'gold_jewelry_excluded')).toBe(true);
  });

  it('includes bank certificates and real estate in gross', () => {
    const r = computeZakat(
      {
        yearType: 'hijri',
        cashEgp: nisab.nisabEgp,
        equitiesEgp: 0,
        bankCertificatesEgp: 10_000,
        realEstateEgp: 20_000,
        commercialAssetsEgp: 5_000,
        receivablesEgp: 0,
        debtsOwedEgp: 0,
      },
      SAMPLE_METALS,
      nisab,
    );
    expect(r.breakdown.bankCertificatesEgp).toBe(10_000);
    expect(r.breakdown.realEstateEgp).toBe(20_000);
    expect(r.breakdown.commercialAssetsEgp).toBe(5_000);
    expect(r.aboveNisab).toBe(true);
  });

  it('returns zero zakat when below nisab', () => {
    const r = computeZakat(
      {
        yearType: 'hijri',
        cashEgp: 1000,
        equitiesEgp: 0,
        bankCertificatesEgp: 0,
        realEstateEgp: 0,
        commercialAssetsEgp: 0,
        receivablesEgp: 0,
        debtsOwedEgp: 0,
      },
      SAMPLE_METALS,
      nisab,
    );
    expect(r.aboveNisab).toBe(false);
    expect(r.zakatDueEgp).toBe(0);
    expect(r.rate).toBe(ZAKAT_RATE_HIJRI);
  });

  it('applies hijri rate above nisab', () => {
    const r = computeZakat(
      {
        yearType: 'hijri',
        cashEgp: nisab.nisabEgp + 100_000,
        equitiesEgp: 0,
        bankCertificatesEgp: 0,
        realEstateEgp: 0,
        commercialAssetsEgp: 0,
        receivablesEgp: 0,
        debtsOwedEgp: 0,
      },
      SAMPLE_METALS,
      nisab,
    );
    expect(r.aboveNisab).toBe(true);
    expect(r.zakatDueEgp).toBeCloseTo(r.breakdown.netWealthEgp * ZAKAT_RATE_HIJRI, 2);
  });

  it('applies gregorian rate', () => {
    const r = computeZakat(
      {
        yearType: 'gregorian',
        cashEgp: nisab.nisabEgp + 50_000,
        equitiesEgp: 0,
        bankCertificatesEgp: 0,
        realEstateEgp: 0,
        commercialAssetsEgp: 0,
        receivablesEgp: 0,
        debtsOwedEgp: 0,
      },
      SAMPLE_METALS,
      nisab,
    );
    expect(r.rate).toBe(ZAKAT_RATE_GREGORIAN);
    expect(r.zakatDueEgp).toBeCloseTo(r.breakdown.netWealthEgp * ZAKAT_RATE_GREGORIAN, 2);
  });

  it('subtracts debts from net wealth', () => {
    const base = nisab.nisabEgp + 200_000;
    const r = computeZakat(
      {
        yearType: 'hijri',
        cashEgp: base,
        equitiesEgp: 0,
        bankCertificatesEgp: 0,
        realEstateEgp: 0,
        commercialAssetsEgp: 0,
        receivablesEgp: 0,
        debtsOwedEgp: 50_000,
      },
      SAMPLE_METALS,
      nisab,
    );
    expect(r.breakdown.netWealthEgp).toBe(base - 50_000);
  });

  it('values gold by grams and karat', () => {
    const r = computeZakat(
      {
        yearType: 'hijri',
        cashEgp: nisab.nisabEgp,
        equitiesEgp: 0,
        gold: { mode: 'grams', amount: 10, karat: 21 },
        bankCertificatesEgp: 0,
        realEstateEgp: 0,
        commercialAssetsEgp: 0,
        receivablesEgp: 0,
        debtsOwedEgp: 0,
        nisabAttainmentDate: '2025-01-01',
      },
      SAMPLE_METALS,
      nisab,
    );
    expect(r.breakdown.goldEgp).toBe(10 * 3500);
    expect(r.aboveNisab).toBe(true);
    expect(r.hawl).not.toBeNull();
  });
});
