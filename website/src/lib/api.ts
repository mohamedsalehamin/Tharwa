export function getPublicApiBase(): string {
  const v = import.meta.env.VITE_API_BASE?.trim()
  return (v || 'http://localhost:3000').replace(/\/$/, '')
}

export function apiFetchUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  if (import.meta.env.DEV) {
    return `/__tharwa_api${p}`
  }
  return `${getPublicApiBase()}${p}`
}

export type SiteMenuItem = {
  id: string
  labelAr: string
  labelEn: string
  href: string
}

export type SiteNavigation = {
  header: SiteMenuItem[]
  footer: SiteMenuItem[]
}

export type SitePage = {
  slug: string
  titleAr: string
  titleEn: string
  contentAr: string
  contentEn: string
  kind: 'standard' | 'contact'
}

export async function fetchNavigation(): Promise<SiteNavigation> {
  const res = await fetch(apiFetchUrl('/v1/site/navigation'))
  if (!res.ok) throw new Error('Failed to load navigation')
  return (await res.json()) as SiteNavigation
}

export async function fetchPage(slug: string): Promise<SitePage> {
  const res = await fetch(apiFetchUrl(`/v1/site/pages/${encodeURIComponent(slug)}`))
  if (res.status === 404) throw new PageNotFoundError()
  if (!res.ok) throw new Error('Failed to load page')
  const data = (await res.json()) as { page: SitePage }
  return data.page
}

export class PageNotFoundError extends Error {
  constructor() {
    super('Page not found')
    this.name = 'PageNotFoundError'
  }
}

export async function submitContact(body: {
  name: string
  email: string
  subject?: string
  message: string
}): Promise<void> {
  const res = await fetch(apiFetchUrl('/v1/contact'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    let message = 'Failed to send message'
    try {
      const data = (await res.json()) as { message?: string }
      if (data.message) message = data.message
    } catch {
      /* ignore */
    }
    throw new Error(message)
  }
}
