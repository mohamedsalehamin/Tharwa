import { Link } from 'react-router-dom'
import { DownloadBadges } from '@/components/landing/DownloadBadges'
import { FeatureBlock } from '@/components/landing/FeatureBlock'
import { PhoneMockup } from '@/components/landing/PhoneMockup'
import { useLocale } from '@/lib/locale'

/** Replace paths in public/images/ with real PNG screenshots when ready. */
const IMAGES = {
  hero: '/images/hero-app.svg',
  fx: '/images/feature-fx.svg',
  gold: '/images/feature-gold.svg',
  egx: '/images/feature-egx.svg',
  watchlist: '/images/feature-watchlist.svg',
} as const

const FEATURES = [
  {
    key: 'fx',
    titleEn: 'Official FX at a glance',
    titleAr: 'أسعار الصرف الرسمية بلمحة',
    bodyEn:
      'Track USD, EUR, SAR, AED, and more versus EGP from agreed institutional sources — updated and clearly labeled.',
    bodyAr:
      'تابع الدولار واليورو والريال والدرهم وغيرها مقابل الجنيه من مصادر مؤسسية معتمدة — محدّثة وواضحة المصدر.',
    image: IMAGES.fx,
    reverse: false,
  },
  {
    key: 'gold',
    titleEn: 'Gold prices Egyptians actually use',
    titleAr: 'أسعار الذهب اللي المصريين بيتابعوها',
    bodyEn:
      'Local karat breakdowns, gram prices in EGP, and day change — so you know where gold stands before you decide.',
    bodyAr:
      'تفاصيل العيارات المحلية وأسعار الجرام بالجنيه وتغيّر اليوم — عشان تعرف وضع الذهب قبل أي قرار.',
    image: IMAGES.gold,
    reverse: true,
  },
  {
    key: 'egx',
    titleEn: 'Curated EGX equities',
    titleAr: 'أسهم البورصة المصرية المختارة',
    bodyEn:
      'Browse a focused list of Egyptian listed stocks with indicative prices, day change, and charts for key periods.',
    bodyAr:
      'تصفّح قائمة مركّزة من أسهم البورصة المصرية مع الأسعار والتغيّر اليومي والرسوم البيانية لفترات مهمة.',
    image: IMAGES.egx,
    reverse: false,
  },
  {
    key: 'watchlist',
    titleEn: 'Your watchlist, one place',
    titleAr: 'قائمة متابعتك في مكان واحد',
    bodyEn:
      'Mix FX, metals, and equities in a personal watchlist — reorder, remove, and check everything without switching apps.',
    bodyAr:
      'اجمع العملات والمعادن والأسهم في قائمة متابعة شخصية — رتّب، احذف، وتابع كل حاجة من غير ما تتنقل بين تطبيقات.',
    image: IMAGES.watchlist,
    reverse: true,
  },
] as const

export function LandingPage() {
  const { locale, t } = useLocale()

  return (
    <>
      <section className='overflow-hidden bg-gradient-to-b from-navy to-[#0d1f38] text-white'>
        <div className='mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 md:grid-cols-2 md:gap-16 md:py-24'>
          <div>
            <p className='mb-4 text-sm font-semibold uppercase tracking-wide text-gold'>
              {t('Wealth-building tools', 'أدوات تكوين الثروة')}
            </p>
            <h1 className='mb-5 text-4xl font-bold leading-tight tracking-tight md:text-5xl lg:text-[3.25rem]'>
              {t('Tools that help you build your wealth', 'أدوات تساعدك تبني ثروتك')}
            </h1>
            <p className='mb-6 max-w-xl text-lg font-medium text-white/90'>
              {t(
                'Tharwa is more than market prices — track what you own, set financial goals, and see whether your wealth is really growing, with clear Egyptian market data built in.',
                'ثروة أكتر من أسعار السوق — تابع ما تملكه، حدّد أهدافك المالية، واعرف هل ثروتك فعلاً بتكبر، مع بيانات السوق المصرية واضحة ومدمجة.',
              )}
            </p>
            <p className='mb-8 max-w-lg text-base text-soft-gray'>
              {t(
                'Informational only — not trading advice. Clear labels when data is delayed or sourced.',
                'للاطلاع فقط — ليس نصيحة استثمارية. تسميات واضحة عند تأخر البيانات أو مصدرها.',
              )}
            </p>
            <DownloadBadges className='mb-6' />
            <Link
              to='/contact'
              className='inline-flex text-sm font-medium text-gold transition-colors hover:text-gold-pressed'
            >
              {t('Questions? Contact us →', 'عندك سؤال؟ اتصل بنا ←')}
            </Link>
          </div>

          <PhoneMockup
            src={IMAGES.hero}
            alt={t('Tharwa wealth planning app', 'تطبيق ثروة لتكوين الثروة')}
            className='md:justify-self-end'
          />
        </div>
      </section>

      <section className='border-y border-divider bg-navy-light py-10 text-white'>
        <div className='mx-auto max-w-6xl px-4 text-center'>
          <p className='text-lg font-semibold text-gold md:text-xl'>
            {t(
              'From watching the market to planning your wealth — one app, built for Egypt.',
              'من متابعة السوق لتخطيط ثروتك — تطبيق واحد، مصمّم لمصر.',
            )}
          </p>
        </div>
      </section>

      <section className='bg-navy'>
        {FEATURES.map((feature) => (
          <FeatureBlock
            key={feature.key}
            title={locale === 'ar' ? feature.titleAr : feature.titleEn}
            body={locale === 'ar' ? feature.bodyAr : feature.bodyEn}
            imageSrc={feature.image}
            imageAlt={locale === 'ar' ? feature.titleAr : feature.titleEn}
            reverse={feature.reverse}
          />
        ))}
      </section>

      <section id='download' className='border-t border-divider bg-gradient-to-b from-navy-light to-navy py-20 text-white'>
        <div className='mx-auto max-w-6xl px-4 text-center'>
          <h2 className='mb-4 text-3xl font-bold text-gold md:text-4xl'>
            {t('Download Tharwa', 'حمّل ثروة')}
          </h2>
          <p className='mx-auto mb-10 max-w-xl text-lg text-soft-gray'>
            {t(
              'Start building your wealth with tools for tracking, planning, and staying informed.',
              'ابدأ تبني ثروتك بأدوات المتابعة والتخطيط والاطلاع.',
            )}
          </p>
          <DownloadBadges className='justify-center' />
        </div>
      </section>
    </>
  )
}
