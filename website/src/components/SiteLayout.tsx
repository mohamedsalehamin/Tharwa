import { Link, Outlet, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchNavigation } from '@/lib/api'
import { useLocale } from '@/lib/locale'

function NavLink({ href, label }: { href: string; label: string }) {
  const isExternal = href.startsWith('http')
  const className = 'text-sm font-medium text-soft-gray transition-colors hover:text-gold'

  if (isExternal) {
    return (
      <a href={href} target='_blank' rel='noreferrer' className={className}>
        {label}
      </a>
    )
  }

  return (
    <Link to={href} className={className}>
      {label}
    </Link>
  )
}

export function SiteLayout({ children }: { children?: React.ReactNode }) {
  const { locale, setLocale, isRtl, t } = useLocale()
  const location = useLocation()
  const isHome = location.pathname === '/'

  const { data: nav } = useQuery({
    queryKey: ['site-navigation'],
    queryFn: fetchNavigation,
    staleTime: 60_000,
  })

  const headerItems = nav?.header ?? []
  const footerItems = nav?.footer ?? []

  const downloadHref = isHome ? '#download' : '/#download'

  return (
    <div dir={isRtl ? 'rtl' : 'ltr'} className='flex min-h-svh flex-col'>
      <header className='sticky top-0 z-50 border-b border-divider bg-navy/95 backdrop-blur'>
        <div className='mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 md:py-4'>
          <Link to='/' className='flex items-center gap-2.5'>
            <img
              src='/social-templates/tharwa-logo.png'
              alt=''
              className='h-8 w-8 rounded-lg'
              width={32}
              height={32}
            />
            <span className='text-lg font-bold tracking-tight text-gold'>{t('Tharwa', 'ثروة')}</span>
          </Link>

          <nav className='hidden items-center gap-6 md:flex'>
            {headerItems.map((item) => (
              <NavLink
                key={item.id}
                href={item.href}
                label={locale === 'ar' ? item.labelAr : item.labelEn}
              />
            ))}
          </nav>

          <div className='flex items-center gap-2'>
            <button
              type='button'
              onClick={() => setLocale(locale === 'en' ? 'ar' : 'en')}
              className='hidden rounded-md border border-divider px-2 py-1 text-xs font-medium text-soft-gray transition-colors hover:border-gold hover:text-gold sm:inline-block'
            >
              {locale === 'en' ? 'العربية' : 'English'}
            </button>
            <a
              href={downloadHref}
              className='rounded-lg bg-gold px-3 py-2 text-xs font-semibold text-ink transition-colors hover:bg-gold-pressed md:px-4 md:py-2.5 md:text-sm'
            >
              {t('Download', 'حمّل التطبيق')}
            </a>
          </div>
        </div>
      </header>

      <main className='flex-1'>{children ?? <Outlet />}</main>

      <footer className='border-t-4 border-gold bg-navy'>
        <div className='mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 md:flex-row md:items-center md:justify-between'>
          <p className='text-sm text-soft-gray'>
            © {new Date().getFullYear()} {t('Tharwa', 'ثروة')}.{' '}
            {t('Wealth-building tools for everyone.', 'أدوات تكوين الثروة للجميع.')}
          </p>
          <nav className='flex flex-wrap gap-4'>
            {footerItems.map((item) => (
              <NavLink
                key={item.id}
                href={item.href}
                label={locale === 'ar' ? item.labelAr : item.labelEn}
              />
            ))}
          </nav>
        </div>
      </footer>
    </div>
  )
}
