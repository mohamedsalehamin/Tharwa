import { createFileRoute } from '@tanstack/react-router'
import { ActivityList } from '@/features/tharwa/activity-list'

export const Route = createFileRoute('/_authenticated/activity/')({
  component: ActivityList,
})
