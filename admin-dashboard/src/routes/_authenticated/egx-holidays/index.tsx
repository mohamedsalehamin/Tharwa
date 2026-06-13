import { createFileRoute } from '@tanstack/react-router'
import { EgxHolidaysPanel } from '@/features/tharwa/egx-holidays'

export const Route = createFileRoute('/_authenticated/egx-holidays/')({
  component: EgxHolidaysPanel,
})
