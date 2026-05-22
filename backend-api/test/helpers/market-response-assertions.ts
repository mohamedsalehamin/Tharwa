import { expect } from 'vitest';

/** Structural checks when OpenAPI `MetalItem.karat` enum does not admit `null` (troy oz rows). */
export function assertMetalsListShape(body: unknown): void {
  expect(body).toMatchObject({
    disclaimer: expect.any(String),
    items: expect.any(Array),
  });
  const items = (body as { items: Record<string, unknown>[] }).items;
  expect(items.length).toBeGreaterThan(0);
  for (const item of items) {
    expect(item.metal).toMatch(/^(gold|silver)$/);
    expect(item.unit).toMatch(/^(gram|troy_ounce)$/);
    expect(typeof item.amountEgp).toBe('number');
    expect(typeof item.asOf).toBe('string');
    expect(typeof item.isStale).toBe('boolean');
  }
}

export function assertMarketSummaryShape(body: unknown): void {
  expect(body).toMatchObject({
    disclaimer: expect.any(String),
    fx: expect.any(Array),
    metals: expect.any(Array),
  });
  assertMetalsListShape({ disclaimer: (body as { disclaimer: string }).disclaimer, items: (body as { metals: unknown[] }).metals });
}
