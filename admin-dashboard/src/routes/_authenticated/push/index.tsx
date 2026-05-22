import { createFileRoute } from '@tanstack/react-router'
import { PushNotifications } from '@/features/tharwa/push-notifications'

export const Route = createFileRoute('/_authenticated/push/')({
  component: PushNotifications,
})
