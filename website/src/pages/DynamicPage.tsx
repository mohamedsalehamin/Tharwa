import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ContactForm } from '@/components/ContactForm'
import { PageNotFoundError, fetchPage } from '@/lib/api'
import { useLocale } from '@/lib/locale'

export function DynamicPage() {
  const { slug = '' } = useParams()
  const { locale, t } = useLocale()

  const { data: page, isLoading, error } = useQuery({
    queryKey: ['site-page', slug],
    queryFn: () => fetchPage(slug),
    enabled: slug.length > 0,
  })

  if (isLoading) {
    return (
      <div className='mx-auto max-w-3xl px-4 py-16 text-muted'>
        {t('Loading…', 'جاري التحميل…')}
      </div>
    )
  }

  if (error instanceof PageNotFoundError || !page) {
    return (
      <div className='mx-auto max-w-3xl px-4 py-16'>
        <h1 className='mb-2 text-2xl font-bold'>{t('Page not found', 'الصفحة غير موجودة')}</h1>
        <p className='text-muted'>{t('This page may have been removed.', 'ربما تمت إزالة هذه الصفحة.')}</p>
      </div>
    )
  }

  const title = locale === 'ar' ? page.titleAr : page.titleEn
  const content = locale === 'ar' ? page.contentAr : page.contentEn

  return (
    <article className='mx-auto max-w-3xl px-4 py-16'>
      <h1 className='mb-6 text-3xl font-bold tracking-tight'>{title}</h1>
      <div className='prose-page mb-10'>
        {content.split('\n\n').map((paragraph) => (
          <p key={paragraph.slice(0, 40)}>{paragraph}</p>
        ))}
      </div>
      {page.kind === 'contact' ? <ContactForm /> : null}
    </article>
  )
}
