import * as Sentry from '@sentry/react'

const dsn = import.meta.env.VITE_SENTRY_DSN?.trim()

let enabled = false

export function initSentry(): void {
  if (!dsn) return
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 0,
    integrations: [Sentry.browserTracingIntegration()],
  })
  enabled = true
}

export function isSentryEnabled(): boolean {
  return enabled
}

export function captureException(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  if (!enabled) return
  Sentry.withScope((scope) => {
    if (context) scope.setContext('extra', context)
    Sentry.captureException(error)
  })
}

export function captureApiFailure(
  path: string,
  status: number,
  message: string,
): void {
  if (!enabled) return
  Sentry.withScope((scope) => {
    scope.setTag('api_path', path)
    scope.setTag('http_status', String(status))
    scope.setLevel(status >= 500 ? 'error' : 'warning')
    Sentry.captureMessage(`API ${status}: ${message}`)
  })
}

export { Sentry }
