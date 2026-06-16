import { createFileRoute } from '@tanstack/react-router'
import { SocialPostsPanel } from '@/features/tharwa/social-posts'

export const Route = createFileRoute('/_authenticated/social/')({
  component: SocialPostsPanel,
})
