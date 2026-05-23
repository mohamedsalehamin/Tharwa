import { createFileRoute } from '@tanstack/react-router'
import { SiteNavigationPanel } from '@/features/tharwa/site-website'

export const Route = createFileRoute('/_authenticated/website/navigation/')({
  component: SiteNavigationPanel,
})
