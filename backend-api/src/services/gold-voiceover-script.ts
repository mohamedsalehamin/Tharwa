import {
  formatEgpAmountForNamaa,
  integerToSpokenArabic,
  karat18Spoken,
  karat21Spoken,
  karat24Spoken,
  normalizeForNamaaTts,
} from './arabic-number-words.js';

export type GoldVoiceoverInput = {
  gold24Price?: number | null;
  gold21Price: number;
  gold18Price?: number | null;
  goldPoundPrice?: number | null;
  goldOuncePrice?: number | null;
  /** Change on عيار 21 since market open (EGP). */
  changeEgpFromOpen: number;
};

export type GoldVoiceoverScript = {
  intro: string;
  cta: string;
  /** Intro + CTA in one string for single-shot TTS (Gemini). */
  full: string;
};

/** Demo bundle — aligned with demo-gold-short.ts template vars. */
export const DEMO_GOLD_VOICEOVER: GoldVoiceoverInput = {
  gold24Price: 4705,
  gold21Price: 4120,
  gold18Price: 3520,
  goldPoundPrice: 32960,
  goldOuncePrice: 285_400,
  changeEgpFromOpen: -40,
};

/** Fixed CTA — generated once, reused for every daily voiceover. */
export const GOLD_VOICEOVER_CTA = 'حمّل Tharwa وتابع من التطبيق.';

/** Gemini misreads «الأونصة» — Egyptian: «اونصة الدهب». */
export const OUNCE_PRICE_LABEL = 'سعر اونصة الدهب';

const SPOKEN_EGP = 'جنيه';

function priceLine(label: string, price: number | null | undefined): string | null {
  if (price == null || !Number.isFinite(price)) return null;
  return `${label}. ${formatEgpAmountForNamaa(price, SPOKEN_EGP)}`;
}

function changePhrase(changeEgp: number): string {
  if (changeEgp === 0) return `${karat21Spoken()} مستقر من أول النهارده.`;
  const amount = integerToSpokenArabic(Math.abs(changeEgp));
  if (changeEgp < 0) {
    return `${karat21Spoken()} نزل ${amount} ${SPOKEN_EGP} من أول النهارده.`;
  }
  return `${karat21Spoken()} زاد ${amount} ${SPOKEN_EGP} من أول النهارده.`;
}

/** Build NAMAA intro + CTA from live or demo gold prices (all figures as spoken words). */
export function buildGoldVoiceoverScript(input: GoldVoiceoverInput): GoldVoiceoverScript {
  const lines = [
    'الأسعار النهارده.',
    priceLine(karat24Spoken(), input.gold24Price),
    priceLine(karat21Spoken(), input.gold21Price),
    priceLine(karat18Spoken(), input.gold18Price),
    priceLine('الجنيه الدهب', input.goldPoundPrice),
    priceLine(OUNCE_PRICE_LABEL, input.goldOuncePrice),
    changePhrase(input.changeEgpFromOpen),
  ].filter((line): line is string => line != null);

  const intro = normalizeForNamaaTts(lines.join(' '));
  const full = normalizeForNamaaTts(`${lines.join(' ')} ${GOLD_VOICEOVER_CTA}`);
  return { intro, cta: GOLD_VOICEOVER_CTA, full };
}

export { normalizeForNamaaTts };
