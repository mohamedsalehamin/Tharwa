import { createFileRoute } from '@tanstack/react-router'
import { IntegrationsSettings } from '@/features/tharwa/integrations'

export const Route = createFileRoute('/_authenticated/settings/integrations')({
  component: IntegrationsSettings,
})
