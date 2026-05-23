import { createFileRoute } from '@tanstack/react-router'
import { SitePagesPanel } from '@/features/tharwa/site-website'

export const Route = createFileRoute('/_authenticated/website/pages/')({
  component: SitePagesPanel,
})
