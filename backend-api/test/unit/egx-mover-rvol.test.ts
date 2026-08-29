import { describe, expect, it } from 'vitest';
import { moverRowFromScannerData } from '../../src/services/connectors/tradingview-scanner-egypt.js';

describe('moverRowFromScannerData', () => {
  it('attaches 10d/30d averages and relative volume', () => {
    const row = moverRowFromScannerData('EGX:COMI', [
      'COMI',
      'Commercial International Bank',
      80.5,
      1.25,
      1.0,
      200_000,
      'comi',
      100_000,
      50_000,
    ]);
    expect(row.symbol).toBe('COMI');
    expect(row.volume).toBe(200000);
    expect(row.avgVolume10d).toBe(100000);
    expect(row.avgVolume30d).toBe(50000);
    expect(row.rvol10).toBe(2);
    expect(row.rvol30).toBe(4);
  });

  it('leaves rvol null when averages are missing', () => {
    const row = moverRowFromScannerData('EGX:ZZZ', [
      'ZZZ',
      'Unknown',
      1,
      0,
      0,
      10,
      '',
      null,
      null,
    ]);
    expect(row.rvol10).toBeNull();
    expect(row.rvol30).toBeNull();
    expect(row.avgVolume10d).toBeNull();
    expect(row.avgVolume30d).toBeNull();
  });
});
