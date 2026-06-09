export type BriefLocale = 'ar' | 'en';

export function normalizeBriefLocale(raw: string | null | undefined): BriefLocale {
  return raw === 'en' ? 'en' : 'ar';
}

export type LocalizedPushMessages = Record<BriefLocale, { title: string; body: string }>;
