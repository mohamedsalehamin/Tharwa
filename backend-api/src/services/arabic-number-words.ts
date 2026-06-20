/**
 * Convert integers to spoken Arabic for NAMAA TTS (Egyptian-friendly: مية، آلاف، …).
 * Digits in raw text are mispronounced — always expand before synthesis.
 */
const ONES = [
  '',
  'واحد',
  'اتنين',
  'تلاتة',
  'أربعة',
  'خمسة',
  'ستة',
  'سبعة',
  'تمانية',
  'تسعة',
] as const;

const TEENS = [
  'عشرة',
  'حداشر',
  'اتناشر',
  'تلتاشر',
  'اربعتاشر',
  'خمستاشر',
  'ستاشر',
  'سبعتاشر',
  'تمنتاشر',
  'تسعتاشر',
] as const;

const TENS = [
  '',
  '',
  'عشرين',
  'تلاتين',
  'اربعين',
  'خمسين',
  'ستين',
  'سبعين',
  'تمانين',
  'تسعين',
] as const;

function under100(n: number): string {
  if (n === 0) return '';
  if (n < 10) return ONES[n]!;
  if (n < 20) return TEENS[n - 10]!;
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  if (ones === 0) return TENS[tens]!;
  return `${ONES[ones]} و${TENS[tens]}`;
}

function hundredsWord(n: number, joinRestWithWaw = true): string {
  if (n === 0) return '';
  if (n === 100) return 'مية';
  if (n === 200) return 'ميتين';
  if (n < 100) return under100(n);
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const hundredForms: Record<number, string> = {
    1: 'مية',
    2: 'ميتين',
    3: 'تلتمية',
    4: 'ربعمية',
    5: 'خمسمية',
    6: 'ستمية',
    7: 'سبعمية',
    8: 'تمنمية',
    9: 'تسعمية',
  };
  const head = hundredForms[h] ?? `${ONES[h]}مية`;
  if (rest === 0) return head;
  const joiner = joinRestWithWaw ? ' و' : ' ';
  return `${head}${joiner}${under100(rest)}`;
}

function under1000(n: number): string {
  if (n < 100) return under100(n);
  return hundredsWord(n);
}

function thousandMultiplier(count: number): string {
  if (count < 100) return under1000(count);
  return hundredsWord(count, false);
}

function thousandHead(count: number): string {
  if (count === 1) return 'ألف';
  if (count === 2) return 'ألفين';
  const spoken = thousandMultiplier(count);
  if (count < 10) return `${spoken} آلاف`;
  return `${spoken} ألف`;
}

function thousandsWord(n: number): string {
  if (n < 1000) return under1000(n);
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  const head = thousandHead(thousands);
  if (rest === 0) return head;
  return `${head} و${under1000(rest)}`;
}

/** NAMAA mispronounces final ة — Egyptian TTS reads ه better (سبعميه، خمسه). */
function toNamaaPhonetic(text: string): string {
  return text.replace(/ة/g, 'ه');
}

export function integerToSpokenArabic(n: number): string {
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid number: ${n}`);
  }
  const value = Math.round(Math.abs(n));
  if (value === 0) return 'صفر';
  if (value >= 1_000_000) {
    throw new Error(`Number too large for TTS helper: ${n}`);
  }
  return toNamaaPhonetic(thousandsWord(value));
}

export function formatEgpAmountForNamaa(amount: number, currency = 'جنيه'): string {
  const value = Math.round(Math.abs(amount));
  if (value === 0) return `صفر ${currency}.`;
  if (value >= 1_000_000) {
    throw new Error(`Number too large for TTS helper: ${amount}`);
  }
  if (value < 1000) {
    return toNamaaPhonetic(`${under1000(value)} ${currency}.`);
  }
  const thousands = Math.floor(value / 1000);
  const rest = value % 1000;
  const head = thousandHead(thousands);
  if (rest === 0) return toNamaaPhonetic(`${head} ${currency}.`);
  return toNamaaPhonetic(`${head}. ${under1000(rest)} ${currency}.`);
}

export function normalizeForNamaaTts(text: string): string {
  return toNamaaPhonetic(text)
    .replace(/جنية/g, 'جنيه')
    .replace(/تلاف/g, 'آلاف')
    .replace(/الذهب/g, 'الدهب')
    .replace(/(?<![\u0627\u0623\u0625\u0622\u0627\u0644])ذهب/g, 'دهب')
    .replace(/سعر\s+الأونص[هة]/g, 'سعر اونصة الدهب')
    .replace(/سعر\s+الاونس/g, 'سعر اونصة الدهب')
    .replace(/اونصه/g, 'اونصة')
    .replace(/\s+/g, ' ')
    .replace(/\.\s*\./g, '.')
    .trim();
}

export function karat18Spoken(): string {
  return 'عيار تمنتاشر';
}

export function karat21Spoken(): string {
  return 'عيار واحد وعشرين';
}

export function karat24Spoken(): string {
  return 'عيار أربعة وعشرين';
}
