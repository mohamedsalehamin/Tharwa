import { createFileRoute } from '@tanstack/react-router'
import { ContactSubmissionsPanel } from '@/features/tharwa/contact-submissions'

export const Route = createFileRoute('/_authenticated/contact/')({
  component: ContactSubmissionsPanel,
})
