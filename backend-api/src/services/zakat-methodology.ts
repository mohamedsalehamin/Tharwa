export type ZakatMethodologySection = {
  id: string;
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
};

export const ZAKAT_METHODOLOGY_SECTIONS: ZakatMethodologySection[] = [
  {
    id: 'nisab',
    titleAr: 'النصاب',
    titleEn: 'Nisab',
    bodyAr:
      'يُحسب حد النصاب من ٨٥ جرام ذهب عيار ٢١ بسعر الجرام اليوم في ثروة. إن كانت ثروتك الصافية أقل من النصاب، لا زكاة واجبة في هذا التقدير.',
    bodyEn:
      'Nisab is 85 grams of 21-karat gold valued at today’s gram price in Tharwa. If net wealth is below nisab, no zakat is due in this estimate.',
  },
  {
    id: 'rates',
    titleAr: 'نسبة الزكاة',
    titleEn: 'Zakat rate',
    bodyAr:
      'السنة الهجرية: ٢٫٥٪ (٢.5%). السنة الميلادية: ٢٫٥٧٧٪ — للمضطرين فقط عند الضرورة؛ الأفضل الحساب بالهجري.',
    bodyEn:
      'Hijri year: 2.5%. Gregorian year: 2.577% — for necessity only; Hijri is preferred.',
  },
  {
    id: 'hawl',
    titleAr: 'الحول',
    titleEn: 'Hawl (lunar/solar year)',
    bodyAr:
      'يجب أن تبقى الثروة فوق النصاب حولًا كاملًا. التطبيق يعرض عدًّا تقريبيًا للأيام (٣٥٤ يومًا هجريًا أو ٣٦٥ ميلاديًا) ولا يغني عن مراجعة عالم.',
    bodyEn:
      'Wealth must stay above nisab for a full year. The app shows an approximate day count (354 Hijri / 365 Gregorian) — not a substitute for scholarly guidance.',
  },
  {
    id: 'equities',
    titleAr: 'الأسهم',
    titleEn: 'Equities',
    bodyAr:
      'تُقدَّر بقيمة السوق التقريبية من سجل صفقاتك. للتداول أو الاستثمار طويل الأجل تُدخل القيمة كاملة في هذا الإصدار؛ راجع عالمًا للحالات الخاصة.',
    bodyEn:
      'Estimated at indicative market value from your trade journal. Trading and long-term holdings are included at full value in this version; consult a scholar for special cases.',
  },
  {
    id: 'gold_purpose',
    titleAr: 'الذهب والغرض',
    titleEn: 'Gold and purpose',
    bodyAr:
      'ذهب الاستثمار/التجارة: يُدخل كامل القيمة. المجوهرات الشخصية: لا تُحسب في التقدير الافتراضي (٠٪) — أدخل فقط ما تقرر إخراجه للزكاة.',
    bodyEn:
      'Investment/trade gold: full value. Personal jewelry: excluded by default (0%) — enter only what you intend to include for zakat.',
  },
  {
    id: 'other_assets',
    titleAr: 'أصول إضافية',
    titleEn: 'Other assets',
    bodyAr:
      'شهادات الإيداع، عقارات استثمارية (قيمة زكوية تقريبية)، وأصول تجارية (مخزون/ذمم) تُدخل يدويًا بقيمتها التقديرية.',
    bodyEn:
      'Bank certificates, investment real estate (zakatable estimate), and commercial assets (inventory/receivables) are entered manually at your estimate.',
  },
  {
    id: 'practice',
    titleAr: 'محفظة التدريب',
    titleEn: 'Practice account',
    bodyAr: 'الأموال والصفقات في المحفظة التجريبية افتراضية ولا تدخل في حساب الزكاة.',
    bodyEn: 'Practice portfolio cash and trades are virtual and excluded from zakat.',
  },
  {
    id: 'disclaimer',
    titleAr: 'تنبيه',
    titleEn: 'Disclaimer',
    bodyAr:
      'هذه حاسبة تقديرية وليست فتوى. الاختلاف الفقهي وارد — راجع مستشارًا شرعيًا معتمدًا قبل الأداء.',
    bodyEn:
      'This is an estimator, not a fatwa. Scholarly views differ — consult a qualified advisor before paying zakat.',
  },
];

export function getZakatMethodologyPayload(): {
  disclaimer: string;
  sections: ZakatMethodologySection[];
} {
  return {
    disclaimer:
      'المحتوى تعليمي فقط. | Educational content only.',
    sections: ZAKAT_METHODOLOGY_SECTIONS,
  };
}
