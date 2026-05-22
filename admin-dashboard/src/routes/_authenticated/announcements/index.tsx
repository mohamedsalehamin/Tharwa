import { createFileRoute } from '@tanstack/react-router'
import { AnnouncementsPanel } from '@/features/tharwa/announcements'

export const Route = createFileRoute('/_authenticated/announcements/')({
  component: AnnouncementsPanel,
})
