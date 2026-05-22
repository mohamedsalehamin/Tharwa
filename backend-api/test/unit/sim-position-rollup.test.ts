import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { netSimQuantity, rollupSimPositions } from '../../src/services/sim-position-rollup.js';

const meta = { instrumentId: 'i1', code: 'COMI', displayNameEn: 'COMI', metadata: null };

function trade(side: 'buy' | 'sell', qty: number, price: number) {
  return {
    ...meta,
    side,
    quantity: new Prisma.Decimal(qty),
    fillPriceEgp: new Prisma.Decimal(price),
  };
}

describe('rollupSimPositions', () => {
  it('computes average cost and net qty', () => {
    const rolled = rollupSimPositions([
      trade('buy', 100, 10),
      trade('buy', 50, 12),
    ]);
    expect(rolled).toHaveLength(1);
    expect(rolled[0]!.qty).toBe(150);
    expect(rolled[0]!.cost).toBe(100 * 10 + 50 * 12);
  });

  it('reduces cost basis on partial sell', () => {
    const rolled = rollupSimPositions([
      trade('buy', 100, 10),
      trade('sell', 40, 11),
    ]);
    expect(rolled[0]!.qty).toBe(60);
    expect(rolled[0]!.cost).toBeCloseTo(600, 5);
  });
});

describe('netSimQuantity', () => {
  it('sums buys minus sells', () => {
    expect(
      netSimQuantity([
        { side: 'buy', quantity: new Prisma.Decimal(10) },
        { side: 'sell', quantity: new Prisma.Decimal(3) },
      ]),
    ).toBe(7);
  });
});
