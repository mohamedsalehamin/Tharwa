import { createFileRoute } from '@tanstack/react-router'
import { LearnContentPanel } from '@/features/tharwa/learn-content'

export const Route = createFileRoute('/_authenticated/learn/')({
  component: LearnContentPanel,
})
