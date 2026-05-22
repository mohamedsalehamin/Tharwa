import { createFileRoute } from '@tanstack/react-router'
import { OperationalDashboard } from '@/features/tharwa/operational-dashboard'

export const Route = createFileRoute('/_authenticated/')({
  component: OperationalDashboard,
})
