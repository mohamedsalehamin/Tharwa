import { useLocale } from '@/lib/locale'
import { DOWNLOAD_PATHS } from '@/lib/storeLinks'

type DownloadBadgesProps = {
  className?: string
}

export function DownloadBadges({ className = '' }: DownloadBadgesProps) {
  const { t } = useLocale()

  const badgeClassName =
    'inline-flex items-center rounded-xl border border-white/20 bg-white/10 px-6 py-3 text-sm font-semibold text-white transition-colors hover:border-gold hover:bg-white/15'

  return (
    <div className={`flex flex-wrap gap-4 ${className}`}>
      <a href={DOWNLOAD_PATHS.ios} className={badgeClassName}>
        App Store
      </a>
      <a href={DOWNLOAD_PATHS.android} className={badgeClassName}>
        Google Play
      </a>
      <p className='w-full text-sm text-soft-gray'>
        {t('Free on iPhone and Android.', 'مجاني على iPhone و Android.')}
      </p>
    </div>
  )
}
