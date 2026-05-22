import { useEffect } from 'react'
import type { ErrorComponentProps } from '@tanstack/react-router'
import { captureException } from '@/observability/sentry'
import { GeneralError } from '@/features/errors/general-error'

/** TanStack Router error boundary — reports to Sentry then shows the 500 UI. */
export function RouteError({ error }: ErrorComponentProps) {
  useEffect(() => {
    captureException(error)
  }, [error])

  return <GeneralError />
}
