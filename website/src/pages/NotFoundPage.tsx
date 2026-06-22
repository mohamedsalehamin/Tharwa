import { Link } from 'react-router-dom'
import { useLocale } from '@/lib/locale'

export function NotFoundPage() {
  const { t } = useLocale()

  return (
    <div className='mx-auto max-w-3xl px-4 py-24 text-center'>
      <h1 className='mb-2 text-3xl font-bold text-ink'>{t('Page not found', 'الصفحة غير موجودة')}</h1>
      <p className='mb-6 text-muted'>{t('We could not find that page.', 'لم نجد هذه الصفحة.')}</p>
      <Link to='/' className='font-medium text-gold transition-colors hover:text-gold-pressed'>
        {t('Back to home', 'العودة للرئيسية')}
      </Link>
    </div>
  )
}
