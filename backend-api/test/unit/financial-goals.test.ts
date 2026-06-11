import { describe, expect, it } from 'vitest';
import { computeGoalProjection, wholeMonthsBetween } from '../../src/services/financial-goals.js';

const NOW = new Date('2026-06-01T00:00:00.000Z');

describe('wholeMonthsBetween', () => {
  it('counts whole months and accounts for day-of-month', () => {
    expect(wholeMonthsBetween(new Date('2026-01-01'), new Date('2026-07-01'))).toBe(6);
    expect(wholeMonthsBetween(new Date('2026-01-15'), new Date('2026-07-10'))).toBe(5);
    expect(wholeMonthsBetween(new Date('2026-07-01'), new Date('2026-01-01'))).toBe(-6);
  });
});

describe('computeGoalProjection', () => {
  it('computes required monthly with no assumed return', () => {
    const p = computeGoalProjection(
      {
        targetAmountEgp: 120000,
        targetDate: new Date('2026-12-01T00:00:00.000Z'),
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        currentSavedEgp: 0,
      },
      NOW,
    );
    expect(p.monthsRemaining).toBe(6);
    expect(p.requiredMonthlyEgp).toBe(20000); // 120000 / 6
    expect(p.status).toBe('active');
  });

  it('caps progress at 100% and marks achieved (onTrack true, required 0)', () => {
    const p = computeGoalProjection(
      {
        targetAmountEgp: 100000,
        targetDate: new Date('2026-12-01T00:00:00.000Z'),
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        currentSavedEgp: 150000,
      },
      NOW,
    );
    expect(p.status).toBe('achieved');
    expect(p.progressPct).toBe(100);
    expect(p.requiredMonthlyEgp).toBe(0);
    expect(p.onTrack).toBe(true);
  });

  it('avoids divide-by-zero for a same-month / past target', () => {
    const p = computeGoalProjection(
      {
        targetAmountEgp: 50000,
        targetDate: new Date('2026-06-15T00:00:00.000Z'),
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        currentSavedEgp: 10000,
      },
      NOW,
    );
    expect(p.monthsRemaining).toBe(0);
    expect(p.requiredMonthlyEgp).toBe(40000); // remaining / max(1, 0)
  });

  it('marks an unmet past-due goal as behind', () => {
    const p = computeGoalProjection(
      {
        targetAmountEgp: 50000,
        targetDate: new Date('2026-05-01T00:00:00.000Z'),
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        currentSavedEgp: 40000,
      },
      NOW,
    );
    expect(p.status).toBe('past_due');
    expect(p.onTrack).toBe(false);
  });

  it('pace-based onTrack: ahead of schedule', () => {
    // created 2026-01-01, target 2027-01-01 (12 mo), now 2026-06-01 → 5/12 ≈ 41.7% expected
    const ahead = computeGoalProjection(
      {
        targetAmountEgp: 100000,
        targetDate: new Date('2027-01-01T00:00:00.000Z'),
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        currentSavedEgp: 60000, // 60% > 41.7%
      },
      NOW,
    );
    expect(ahead.onTrack).toBe(true);

    const behind = computeGoalProjection(
      {
        targetAmountEgp: 100000,
        targetDate: new Date('2027-01-01T00:00:00.000Z'),
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        currentSavedEgp: 20000, // 20% < 41.7%
      },
      NOW,
    );
    expect(behind.onTrack).toBe(false);
  });

  it('adds a clearly-labeled illustrative scenario only when a rate is provided', () => {
    const withRate = computeGoalProjection(
      {
        targetAmountEgp: 100000,
        targetDate: new Date('2027-06-01T00:00:00.000Z'),
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        currentSavedEgp: 50000,
        illustrativeAnnualRatePct: 10,
      },
      NOW,
    );
    expect(withRate.illustrativeScenario).toBeDefined();
    expect(withRate.illustrativeScenario!.label.toLowerCase()).toContain('illustrative');
    expect(withRate.illustrativeScenario!.projectedValueEgp).toBeCloseTo(55000, 0); // 50000 * 1.1^1

    const withoutRate = computeGoalProjection(
      {
        targetAmountEgp: 100000,
        targetDate: new Date('2027-06-01T00:00:00.000Z'),
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        currentSavedEgp: 50000,
      },
      NOW,
    );
    expect(withoutRate.illustrativeScenario).toBeUndefined();
  });
});
