import { createFileRoute } from '@tanstack/react-router'
import { EquityListsPanel } from '@/features/tharwa/equity-lists-panel'

export const Route = createFileRoute('/_authenticated/equity-lists/')({
  component: EquityListsPanel,
})
