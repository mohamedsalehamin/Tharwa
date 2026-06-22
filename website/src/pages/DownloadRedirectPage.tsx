import { useEffect, useLayoutEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLocale } from '@/lib/locale'
import { APP_STORE_URL, PLAY_STORE_URL } from '@/lib/storeLinks'

type Platform = 'android' | 'ios'

const REDIRECT_HINT_MS = 1500

const STORE_URL: Record<Platform, string> = {
  android: PLAY_STORE_URL,
  ios: APP_STORE_URL,
}

const STORE_LABEL: Record<Platform, { en: string; ar: string }> = {
  android: { en: 'Google Play', ar: 'Google Play' },
  ios: { en: 'App Store', ar: 'App Store' },
}

const STORE_CTA: Record<Platform, { en: string; ar: string }> = {
  android: { en: 'Get it on Google Play', ar: 'حمّله من Google Play' },
  ios: { en: 'Download on the App Store', ar: 'حمّله من App Store' },
}

type DownloadRedirectPageProps = {
  platform: Platform
}

export function DownloadRedirectPage({ platform }: DownloadRedirectPageProps) {
  const { t, isRtl } = useLocale()
  const url = STORE_URL[platform]
  const store = STORE_LABEL[platform]
  const cta = STORE_CTA[platform]
  const [needsTap, setNeedsTap] = useState(false)

  useLayoutEffect(() => {
    window.location.replace(url)
  }, [url])

  useEffect(() => {
    const id = window.setTimeout(() => setNeedsTap(true), REDIRECT_HINT_MS)
    return () => window.clearTimeout(id)
  }, [])

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className='flex min-h-svh flex-col items-center justify-center bg-gradient-to-b from-navy to-[#0d1f38] px-4 py-12 text-white'
    >
      <div className='mx-auto w-full max-w-md text-center'>
        <img
          src='/social-templates/tharwa-logo.png'
          alt=''
          className='mx-auto mb-6 h-16 w-16 rounded-2xl shadow-lg'
          width={64}
          height={64}
        />
        <p className='mb-2 text-sm font-semibold uppercase tracking-wide text-gold'>
          {t('Tharwa', 'ثروة')}
        </p>
        <h1 className='mb-3 text-2xl font-bold leading-snug md:text-3xl'>
          {t('Download the app', 'حمّل التطبيق')}
        </h1>
        <p className='mb-8 text-base text-soft-gray md:text-lg'>
          {t(
            'Gold, FX, and EGX market data in one bilingual app.',
            'أسعار الذهب والعملات والبورصة المصرية في تطبيق واحد.',
          )}
        </p>

        <a
          href={url}
          className='inline-flex w-full max-w-sm items-center justify-center rounded-xl bg-gold px-6 py-4 text-base font-bold text-ink shadow-md transition-colors hover:bg-gold-pressed'
        >
          {t(cta.en, cta.ar)}
        </a>

        <p className='mt-6 text-sm text-soft-gray'>
          {needsTap
            ? t(
                `Tap the button above to open ${store.en}.`,
                `اضغط الزر أعلاه لفتح ${store.ar}.`,
              )
            : t(`Redirecting to ${store.en}…`, `جاري التحويل إلى ${store.ar}…`)}
        </p>

        <p className='mt-10'>
          <Link to='/' className='text-sm text-soft-gray transition-colors hover:text-gold'>
            {t('Back to thrwa.co', 'العودة إلى thrwa.co')}
          </Link>
        </p>
      </div>
    </div>
  )
}
