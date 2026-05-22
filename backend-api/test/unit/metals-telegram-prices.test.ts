import { describe, expect, it } from 'vitest';
import { buildGoldRowsFromKaratRules, DEFAULT_GOLD_KARAT_RULES } from '../../src/lib/metal-karat-rules.js';
import type { EgyptParsedPrices } from '../../src/services/connectors/telegram-egypt-metals.js';

/** Mirrors applyTelegramGramPriceOverrides in metals connector (private). */
function applyTelegramGramPriceOverrides(
  goldRows: ReturnType<typeof buildGoldRowsFromKaratRules>,
  parsed: Pick<EgyptParsedPrices, 'karat_18' | 'karat_21' | 'karat_24'>,
) {
  const byKarat: Partial<Record<18 | 21 | 24, number>> = {};
  if (parsed.karat_24 != null) byKarat[24] = parsed.karat_24;
  if (parsed.karat_21 != null) byKarat[21] = parsed.karat_21;
  if (parsed.karat_18 != null) byKarat[18] = parsed.karat_18;
  return goldRows.map((row) => {
    if (row.metal !== 'gold' || row.unit !== 'gram' || row.karat == null) return row;
    const direct = byKarat[row.karat as 18 | 21 | 24];
    if (direct == null) return row;
    return { ...row, amountEgp: Math.round(direct * 10000) / 10000 };
  });
}

describe('telegram gram price overrides', () => {
  it('uses channel karat grams instead of pure 24k ratio math', () => {
    const parsed = {
      karat_18: 5841,
      karat_21: 6815,
      karat_24: 7789,
    };
    const anchor24 = 7789;
    let gold = buildGoldRowsFromKaratRules(
      anchor24,
      DEFAULT_GOLD_KARAT_RULES,
      new Date('2026-05-21T12:00:00Z'),
      false,
    );
    gold = applyTelegramGramPriceOverrides(gold, parsed);

    const g21 = gold.find((g) => g.karat === 21 && g.unit === 'gram');
    const g18 = gold.find((g) => g.karat === 18 && g.unit === 'gram');
    expect(g21?.amountEgp).toBe(6815);
    expect(g18?.amountEgp).toBe(5841);
    expect(g21?.amountEgp).not.toBe(Math.round(((7789 * 21) / 24) * 10000) / 10000);
  });
});
