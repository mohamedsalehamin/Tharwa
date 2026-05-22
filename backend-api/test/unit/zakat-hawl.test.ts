import { describe, expect, it } from 'vitest';
import { buildHawlStatus, HAWL_DAYS_HIJRI } from '../../src/services/zakat-hawl.js';

describe('buildHawlStatus', () => {
  it('returns null for invalid date', () => {
    expect(buildHawlStatus('not-a-date', 'hijri')).toBeNull();
  });

  it('counts days elapsed and remaining for hijri hawl', () => {
    const ref = new Date('2026-05-01T12:00:00.000Z');
    const status = buildHawlStatus('2025-05-01', 'hijri', ref);
    expect(status).not.toBeNull();
    expect(status!.hawlLengthDays).toBe(HAWL_DAYS_HIJRI);
    expect(status!.daysElapsed).toBe(365);
    expect(status!.hawlComplete).toBe(true);
    expect(status!.daysRemaining).toBe(0);
  });

  it('reports incomplete hawl when within year', () => {
    const ref = new Date('2025-08-01T12:00:00.000Z');
    const status = buildHawlStatus('2025-05-01', 'hijri', ref);
    expect(status!.hawlComplete).toBe(false);
    expect(status!.daysRemaining).toBeGreaterThan(0);
  });
});
