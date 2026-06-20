import { describe, expect, it } from 'vitest';
import {
  formatEgpAmountForNamaa,
  integerToSpokenArabic,
  normalizeForNamaaTts,
} from '../../src/services/arabic-number-words.js';
import {
  buildGoldVoiceoverScript,
  DEMO_GOLD_VOICEOVER,
} from '../../src/services/gold-voiceover-script.js';

describe('integerToSpokenArabic', () => {
  it('speaks demo gold price and change', () => {
    expect(integerToSpokenArabic(40)).toBe('اربعين');
    expect(integerToSpokenArabic(120)).toBe('ميه وعشرين');
    expect(integerToSpokenArabic(4120)).toBe('أربعه آلاف وميه وعشرين');
    expect(integerToSpokenArabic(3520)).toBe('تلاته آلاف وخمسميه وعشرين');
    expect(integerToSpokenArabic(32960)).toBe('اتنين وتلاتين ألف وتسعميه وستين');
  });

  it('speaks large ounce prices without extra waw after hundreds', () => {
    expect(integerToSpokenArabic(285_400)).toBe('ميتين خمسه وتمانين ألف وربعميه');
    expect(integerToSpokenArabic(285_400)).not.toMatch(/\d/);
  });
});

describe('formatEgpAmountForNamaa', () => {
  it('splits thousands and remainder with pauses for Chatterbox', () => {
    expect(formatEgpAmountForNamaa(4705)).toBe('أربعه آلاف. سبعميه وخمسه جنيه.');
    expect(formatEgpAmountForNamaa(32960)).toBe('اتنين وتلاتين ألف. تسعميه وستين جنيه.');
    expect(formatEgpAmountForNamaa(285_400)).toBe('ميتين خمسه وتمانين ألف. ربعميه جنيه.');
    expect(formatEgpAmountForNamaa(40)).toBe('اربعين جنيه.');
  });
});

describe('normalizeForNamaaTts', () => {
  it('fixes legacy spellings and converts ta marbuta to ha', () => {
    expect(normalizeForNamaaTts('أربعة تلاف وخمسة جنية')).toBe('أربعه آلاف وخمسه جنيه');
    expect(normalizeForNamaaTts('سبعمية وخمسة')).toBe('سبعميه وخمسه');
    expect(normalizeForNamaaTts('سعر الأونصة')).toBe('سعر اونصة الدهب');
    expect(normalizeForNamaaTts('الجنيه الذهب')).toBe('الجنيه الدهب');
  });
});

describe('buildGoldVoiceoverScript', () => {
  it('includes all karats, pound, ounce, change, and CTA in full script', () => {
    const { intro, cta, full } = buildGoldVoiceoverScript(DEMO_GOLD_VOICEOVER);
    expect(intro).not.toMatch(/\d/);
    expect(intro).toContain('عيار أربعه وعشرين.');
    expect(intro).toContain('أربعه آلاف. سبعميه وخمسه جنيه.');
    expect(intro).toContain('الجنيه الدهب.');
    expect(intro).toContain('سعر اونصة الدهب.');
    expect(intro).not.toMatch(/ذهب/);
    expect(intro).toContain('ميتين خمسه وتمانين ألف. ربعميه جنيه.');
    expect(intro).toContain('نزل اربعين جنيه من أول النهارده.');
    expect(intro).not.toMatch(/ذهب/);
    expect(cta).toContain('Tharwa');
    expect(full).toContain(intro);
    expect(full).toContain('حمّل Tharwa وتابع من التطبيق.');
    expect(full).not.toMatch(/\d/);
  });

  it('omits missing optional prices', () => {
    const { intro } = buildGoldVoiceoverScript({
      gold21Price: 4120,
      changeEgpFromOpen: 0,
    });
    expect(intro).toContain('عيار واحد وعشرين.');
    expect(intro).not.toContain('عيار أربعة وعشرين.');
    expect(intro).not.toContain('الجنيه الدهب');
  });
});
