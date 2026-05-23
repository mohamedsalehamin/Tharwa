import { Link } from 'react-router-dom'
import { useLocale } from '@/lib/locale'

export function LandingPage() {
  const { t } = useLocale()

  return (
    <>
      <section className='bg-gradient-to-b from-teal-50 to-white'>
        <div className='mx-auto grid max-w-6xl gap-10 px-4 py-20 md:grid-cols-2 md:items-center'>
          <div>
            <p className='mb-3 text-sm font-semibold uppercase tracking-wide text-brand'>
              {t('Mobile app', 'تطبيق الجوال')}
            </p>
            <h1 className='mb-4 text-4xl font-bold tracking-tight text-ink md:text-5xl'>
              {t('Egyptian FX, gold & EGX — in your pocket', 'العملات والذهب والبورصة — في جيبك')}
            </h1>
            <p className='mb-8 max-w-lg text-lg text-muted'>
              {t(
                'Tharwa brings official FX rates, precious metals, and curated Egyptian equities together in one simple app.',
                'ثروة تجمع أسعار الصرف الرسمية والمعادن الثمينة وأسهم البورصة المصرية في تطبيق واحد بسيط.',
              )}
            </p>
            <div className='flex flex-wrap gap-3'>
              <a
                href='#download'
                className='rounded-lg bg-brand px-5 py-3 font-semibold text-white hover:bg-brand-dark'
              >
                {t('Get the app', 'حمّل التطبيق')}
              </a>
              <Link
                to='/contact'
                className='rounded-lg border border-slate-300 px-5 py-3 font-semibold text-ink hover:bg-slate-50'
              >
                {t('Contact us', 'اتصل بنا')}
              </Link>
            </div>
          </div>
          <div className='rounded-2xl border border-teal-100 bg-white p-6 shadow-xl shadow-teal-100/50'>
            <div className='mb-4 text-sm font-medium text-muted'>
              {t('Live market snapshot', 'لمحة من السوق')}
            </div>
            <div className='grid gap-3'>
              {[
                [t('USD / EGP', 'دولار / جنيه'), '49.25'],
                [t('Gold 21k (gram)', 'ذهب 21 (جرام)'), '4,120'],
                [t('COMI', 'COMI'), '88.40'],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className='flex items-center justify-between rounded-lg bg-surface px-4 py-3'
                >
                  <span className='font-medium'>{label}</span>
                  <span className='font-semibold text-brand'>{value}</span>
                </div>
              ))}
            </div>
            <p className='mt-4 text-xs text-muted'>
              {t('Illustrative values — open the app for live data.', 'قيم توضيحية — افتح التطبيق للبيانات الحية.')}
            </p>
          </div>
        </div>
      </section>

      <section id='download' className='border-t border-slate-200 bg-white py-16'>
        <div className='mx-auto max-w-6xl px-4 text-center'>
          <h2 className='mb-3 text-2xl font-bold'>{t('Download Tharwa', 'حمّل ثروة')}</h2>
          <p className='mx-auto mb-8 max-w-xl text-muted'>
            {t(
              'Available on iOS and Android. Track markets, manage your watchlist, and stay informed.',
              'متوفر على iOS و Android. تابع الأسواق وأدر قائمة المتابعة وابق على اطلاع.',
            )}
          </p>
          <div className='flex flex-wrap justify-center gap-4'>
            <span className='rounded-lg border border-dashed border-slate-300 px-6 py-3 text-sm text-muted'>
              App Store — {t('coming soon', 'قريباً')}
            </span>
            <span className='rounded-lg border border-dashed border-slate-300 px-6 py-3 text-sm text-muted'>
              Google Play — {t('coming soon', 'قريباً')}
            </span>
          </div>
        </div>
      </section>
    </>
  )
}
