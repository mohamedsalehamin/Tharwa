import { describe, expect, it } from 'vitest';
import { isPriceAlertTriggered } from '../../src/services/evaluate-price-alerts.js';

describe('isPriceAlertTriggered', () => {
  it('above triggers when last >= threshold', () => {
    expect(isPriceAlertTriggered('above', 100, 100)).toBe(true);
    expect(isPriceAlertTriggered('above', 100, 99.99)).toBe(false);
    expect(isPriceAlertTriggered('above', 100, 101)).toBe(true);
  });

  it('below triggers when last <= threshold', () => {
    expect(isPriceAlertTriggered('below', 50, 50)).toBe(true);
    expect(isPriceAlertTriggered('below', 50, 50.01)).toBe(false);
    expect(isPriceAlertTriggered('below', 50, 49)).toBe(true);
  });

  it('rejects non-finite values', () => {
    expect(isPriceAlertTriggered('above', NaN, 100)).toBe(false);
    expect(isPriceAlertTriggered('below', 50, NaN)).toBe(false);
  });
});
