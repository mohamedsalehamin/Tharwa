import { createFileRoute } from '@tanstack/react-router'
import { InstrumentsPage } from '@/features/tharwa/instruments-page'

export const Route = createFileRoute('/_authenticated/instruments/')({
  component: InstrumentsPage,
})
