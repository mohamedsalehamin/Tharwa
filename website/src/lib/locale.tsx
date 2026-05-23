import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

export type Locale = 'en' | 'ar'

type LocaleContextValue = {
  locale: Locale
  setLocale: (locale: Locale) => void
  isRtl: boolean
  t: (en: string, ar: string) => string
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>('en')

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale,
      isRtl: locale === 'ar',
      t: (en, ar) => (locale === 'ar' ? ar : en),
    }),
    [locale],
  )

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useLocale() {
  const ctx = useContext(LocaleContext)
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider')
  return ctx
}
