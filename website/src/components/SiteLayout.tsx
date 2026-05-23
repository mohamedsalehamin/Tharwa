import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchNavigation } from '@/lib/api'
import { useLocale } from '@/lib/locale'

function NavLink({ href, label }: { href: string; label: string }) {
  const isExternal = href.startsWith('http')
  const className = 'text-sm font-medium text-slate-700 hover:text-brand'

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

export function SiteLayout({ children }: { children: React.ReactNode }) {
  const { locale, setLocale, isRtl, t } = useLocale()
  const { data: nav } = useQuery({
    queryKey: ['site-navigation'],
    queryFn: fetchNavigation,
    staleTime: 60_000,
  })

  const headerItems = nav?.header ?? []
  const footerItems = nav?.footer ?? []

  return (
    <div dir={isRtl ? 'rtl' : 'ltr'} className='flex min-h-svh flex-col'>
      <header className='border-b border-slate-200 bg-white/90 backdrop-blur'>
        <div className='mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4'>
          <Link to='/' className='text-lg font-bold tracking-tight text-ink'>
            {t('Tharwa', 'ثروة')}
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
              className='rounded-md border border-slate-300 px-2 py-1 text-xs font-medium'
            >
              {locale === 'en' ? 'العربية' : 'English'}
            </button>
          </div>
        </div>
      </header>

      <main className='flex-1'>{children}</main>

      <footer className='border-t border-slate-200 bg-surface'>
        <div className='mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 md:flex-row md:items-center md:justify-between'>
          <p className='text-sm text-muted'>
            © {new Date().getFullYear()} {t('Tharwa', 'ثروة')}.{' '}
            {t('Egyptian market data for everyone.', 'بيانات السوق المصرية للجميع.')}
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
