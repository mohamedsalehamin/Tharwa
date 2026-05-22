import type { UpstreamHealthStatus } from '@/lib/admin-api'

export function healthStatusLabel(status: UpstreamHealthStatus): string {
  switch (status) {
    case 'healthy':
      return 'Healthy'
    case 'degraded':
      return 'Degraded'
    case 'down':
      return 'Down'
    case 'disabled':
      return 'Disabled'
    case 'unknown':
      return 'Unknown'
    default:
      return status
  }
}

export function healthStatusVariant(
  status: UpstreamHealthStatus,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'healthy':
      return 'default'
    case 'degraded':
      return 'secondary'
    case 'down':
      return 'destructive'
    case 'disabled':
      return 'outline'
    case 'unknown':
      return 'secondary'
    default:
      return 'secondary'
  }
}

export function formatAgeSince(iso: string | null): string | null {
  if (!iso) return null
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (sec < 60) return `${sec}s ago`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`
  return `${Math.floor(sec / 3600)}h ago`
}
