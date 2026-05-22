import { Prisma } from '@prisma/client';

export type SimTradeRollupInput = {
  instrumentId: string;
  code: string;
  displayNameEn: string;
  metadata: unknown;
  side: 'buy' | 'sell';
  quantity: Prisma.Decimal;
  fillPriceEgp: Prisma.Decimal;
};

export type RolledSimPosition = {
  instrumentId: string;
  code: string;
  displayNameEn: string;
  metadata: unknown;
  qty: number;
  cost: number;
};

/** Average-cost position rollup from simulated fills (same logic as journal portfolio). */
export function rollupSimPositions(trades: SimTradeRollupInput[]): RolledSimPosition[] {
  const byInstrument = new Map<string, RolledSimPosition>();

  for (const t of trades) {
    let cell = byInstrument.get(t.instrumentId);
    if (!cell) {
      cell = {
        instrumentId: t.instrumentId,
        code: t.code,
        displayNameEn: t.displayNameEn,
        metadata: t.metadata,
        qty: 0,
        cost: 0,
      };
    }
    const q = t.quantity.toNumber();
    const p = t.fillPriceEgp.toNumber();
    if (t.side === 'buy') {
      cell.cost += q * p;
      cell.qty += q;
    } else {
      const avg = cell.qty > 0 ? cell.cost / cell.qty : 0;
      const sell = Math.min(q, cell.qty);
      cell.cost -= avg * sell;
      cell.qty -= q;
    }
    byInstrument.set(t.instrumentId, cell);
  }

  return [...byInstrument.values()].filter(
    (c) => Math.abs(c.qty) >= 1e-12 || c.cost >= 1e-9,
  );
}

export function netSimQuantity(trades: Pick<SimTradeRollupInput, 'side' | 'quantity'>[]): number {
  let net = 0;
  for (const t of trades) {
    const q = t.quantity.toNumber();
    net += t.side === 'buy' ? q : -q;
  }
  return net;
}
