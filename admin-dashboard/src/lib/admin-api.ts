import { apiFetchUrl, readApiError } from '@/lib/api'
import { throwAdminApiError } from '@/lib/report-api-error'
import type { AdminRole } from '@/lib/admin-roles'
import type { AdminUser } from '@/stores/auth-store'

export type LoginResponse = {
  accessToken: string
  tokenType: string
  expiresIn: number
  user: AdminUser
}

export async function adminLogin(email: string, password: string): Promise<LoginResponse> {
  const res = await fetch(apiFetchUrl('/admin/v1/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    throwAdminApiError('/admin/v1/auth/login', res.status, await readApiError(res))
  }
  return (await res.json()) as LoginResponse
}

export async function adminFetch<T>(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(apiFetchUrl(path), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    throwAdminApiError(path, res.status, await readApiError(res))
  }
  if (res.status === 204) {
    return undefined as T
  }
  const text = await res.text()
  if (!text) {
    return undefined as T
  }
  return JSON.parse(text) as T
}

export type InstrumentKind = 'fx' | 'metal' | 'equity'

export type QuoteCategoryLabel = 'official' | 'indicative' | 'estimate'

export type KaratRuleRow = {
  karat: number | null
  unit: 'gram' | 'troy_ounce'
  priceNumerator: number
  priceDenominator: number
  sortOrder: number
  isActive: boolean
}

export type InstrumentRow = {
  id: string
  kind: InstrumentKind | string
  code: string
  displayNameAr: string
  displayNameEn: string
  isConsumerVisible: boolean
  sortOrder: number
  metadata?: unknown
}

export type EquityCreateBody = {
  code: string
  displayNameEn: string
  displayNameAr?: string
  isConsumerVisible?: boolean
  sortOrder?: number
  metadata?: { tvSymbol?: string }
}

export type EgxSearchHit = {
  symbol: string
  tvSymbol: string
  description: string
  exchange: string
  alreadyExists: boolean
  existingInstrumentId: string | null
}

export type UpstreamType = 'fx' | 'metals' | 'equities'

export type UpstreamHealthStatus =
  | 'disabled'
  | 'healthy'
  | 'degraded'
  | 'down'
  | 'unknown'

export type UpstreamRow = {
  id: string
  name: string
  type: UpstreamType
  enabled: boolean
  config: Record<string, unknown>
  secretRef: string | null
  lastSuccessAt: string | null
  lastError: string | null
  status: UpstreamHealthStatus
}

export type UpstreamsListResponse = {
  items: UpstreamRow[]
  summary: Record<UpstreamHealthStatus, number>
  thresholds: { healthyMaxAgeSec: number; degradedMaxAgeSec: number }
}

export type MarketCacheScope = 'fx' | 'metals' | 'equities' | 'all'

export type InvalidateCacheResponse = {
  scopes: MarketCacheScope[]
  deletedKeys: string[]
  thresholds: { healthyMaxAgeSec: number; degradedMaxAgeSec: number }
}

export type UpstreamCreateBody = {
  name: string
  type: UpstreamType
  enabled?: boolean
  config?: Record<string, unknown>
  secretRef?: string | null
}

export type UpstreamPatchBody = {
  enabled?: boolean
  name?: string
  config?: Record<string, unknown>
  secretRef?: string | null
}

export type IntegrationItem = {
  slug: string
  displayName: string
  configured: boolean
  source: 'database' | 'environment' | null
  updatedAt: string | null
  fcm?: { projectId: string; clientEmail: string }
}

export type PushAudienceItem = {
  audience: string
  deviceCount: number
}

export type PushAudienceStats = {
  fcmConfigured: boolean
  audiences: PushAudienceItem[]
}

export type ConsumerUserRow = {
  id: string
  email: string
  name: string | null
  phone: string | null
  emailVerifiedAt: string | null
  hasPassword: boolean
  hasAuthSubject: boolean
  createdAt: string
  updatedAt: string
}

export type ConsumerUsersList = {
  items: ConsumerUserRow[]
  total: number
  limit: number
  offset: number
}

export type AuditLogRow = {
  id: string
  action: string
  payload: unknown
  ip: string | null
  createdAt: string
  adminUser: {
    id: string
    email: string
    role: string
  }
}

export type AuditLogsList = {
  items: AuditLogRow[]
  total: number
  limit: number
  offset: number
}

/** Common admin audit actions for filter dropdowns. */
export const AUDIT_ACTION_PRESETS = [
  '',
  'admin.auth.login',
  'admin.upstreams.',
  'admin.instruments.',
  'admin.integrations.',
  'admin.push.',
] as const

export function roleLabel(role: AdminRole): string {
  return role === 'superadmin' ? 'Superadmin' : 'Operator'
}

/** Remount key for row editors when server-backed fields change (avoids syncing local state in an effect). */
export function instrumentEditorKey(row: InstrumentRow): string {
  return `${row.id}:${row.displayNameEn}:${row.displayNameAr}:${row.sortOrder}:${row.isConsumerVisible}:${JSON.stringify(row.metadata ?? null)}`
}

export function flagUrlFromMetadata(row: InstrumentRow): string | null {
  const m = row.metadata
  if (m && typeof m === 'object' && 'flagUrl' in m) {
    const u = (m as { flagUrl?: unknown }).flagUrl
    return typeof u === 'string' && u.trim() ? u.trim() : null
  }
  return null
}

export async function adminUploadInstrumentFlag(
  token: string,
  instrumentId: string,
  file: File,
): Promise<{ flagUrl: string; item: InstrumentRow }> {
  const form = new FormData()
  form.append('flag', file)
  const res = await fetch(apiFetchUrl(`/admin/v1/instruments/${instrumentId}/flag`), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
  if (!res.ok) {
    throwAdminApiError(
      `/admin/v1/instruments/${instrumentId}/flag`,
      res.status,
      await readApiError(res),
    )
  }
  return (await res.json()) as { flagUrl: string; item: InstrumentRow }
}

export type MetaSocialPublic = {
  pageId: string
  pageName: string
  igUserId: string | null
  igUsername: string | null
  publishFacebook: boolean
  publishInstagram: boolean
  schedules: {
    goldDaily: { enabled: boolean; hour: number; minute: number }
    egxClose: { enabled: boolean; hour: number; minute: number }
    goldAlert: { enabled: boolean; dropPct: number }
  }
  tokenPreview: string | null
}

export type YoutubeSocialPublic = {
  channelId: string
  channelTitle: string
  publishEnabled: boolean
  connected: boolean
}

export type SocialStatusResponse = {
  configured: boolean
  oauthAvailable: boolean
  oauthScopes?: string
  meta: MetaSocialPublic | null
  youtube: {
    configured: boolean
    oauthAvailable: boolean
    channel: YoutubeSocialPublic | null
  }
  brand: {
    website: string
    facebook: string
    instagram: string
  }
}

export type MetaPageOption = {
  pageId: string
  pageName: string
  pageAccessToken: string
  igUserId: string | null
  igUsername: string | null
}

export type SocialPreviewResult = {
  template: string
  caption: string
  svg: string
  pngBase64: string | null
  pngError: string | null
}

export type SocialPostRunRow = {
  id: string
  template: string
  channel: string
  format: string
  status: string
  caption: string | null
  externalPostId: string | null
  errorMessage: string | null
  triggeredBy: string
  cairoDateKey: string
  postedAt: string | null
  createdAt: string
}

export type SocialPublishChannelResult = {
  channel: string
  format: string
  status: string
  externalPostId: string | null
  errorMessage: string | null
}

export type SocialPublishResponse = {
  published: boolean
  reason?: string
  template?: string
  results?: SocialPublishChannelResult[]
}
