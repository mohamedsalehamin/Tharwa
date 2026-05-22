import { AxiosError } from 'axios'
import { toast } from 'sonner'
import { captureException } from '@/observability/sentry'

function shouldReportToSentry(error: unknown): boolean {
  if (error instanceof AxiosError) {
    const status = error.response?.status ?? 0
    return status >= 500
  }
  return error instanceof Error
}

export function handleServerError(error: unknown) {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log(error)
  }

  let errMsg = 'Something went wrong!'

  if (
    error &&
    typeof error === 'object' &&
    'status' in error &&
    Number(error.status) === 204
  ) {
    errMsg = 'No content.'
  }

  if (error instanceof AxiosError) {
    const title = error.response?.data?.title
    if (typeof title === 'string' && title.length > 0) {
      errMsg = title
    }
  }

  if (shouldReportToSentry(error)) {
    captureException(error)
  }

  toast.error(errMsg)
}
