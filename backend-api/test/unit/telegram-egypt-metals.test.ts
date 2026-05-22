import { describe, expect, it } from 'vitest';
import { parseGoldMessage } from '../../src/services/connectors/telegram-egypt-metals.js';

/** Typical @goldprice10000 post (single physical line with spread + silver). */
const CHANNEL_POST = `📌 اسعار الذهب الأن💍 عيار_18_ 5841ج 💍 عيار_21_ 6815ج 💍 عيار_24_ 7789ج 🔺 فرق البيع والشراء لعيار 21=50ج 🕛 السعر المحلي الفضة=132ج`;

describe('parseGoldMessage', () => {
  it('parses karat and silver from single-line channel broadcast', () => {
    const parsed = parseGoldMessage(CHANNEL_POST);
    expect(parsed).not.toBeNull();
    expect(parsed!.karat_18).toBe(5841);
    expect(parsed!.karat_21).toBe(6815);
    expect(parsed!.karat_24).toBe(7789);
    expect(parsed!.silver_local).toBe(132);
    expect(parsed!.spread_21).toBe(50);
  });
});
