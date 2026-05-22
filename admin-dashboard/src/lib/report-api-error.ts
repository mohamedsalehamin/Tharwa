import { captureApiFailure } from '@/observability/sentry'
import { withNetworkHint } from '@/lib/api'

/** Throw after reporting a failed admin API response to Sentry. */
export function throwAdminApiError(
  path: string,
  status: number,
  message: string,
): never {
  captureApiFailure(path, status, message)
  throw new Error(withNetworkHint(message))
}
