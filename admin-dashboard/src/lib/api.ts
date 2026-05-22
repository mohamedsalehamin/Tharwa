/** Backend origin for production builds (`vite build` / preview). */
export function getPublicApiBase(): string {
  const v = import.meta.env.VITE_API_BASE?.trim()
  return (v || 'http://localhost:3000').replace(/\/$/, '')
}

/** Path for `fetch` — dev uses Vite proxy `/__tharwa_api`. */
export function apiFetchUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  if (import.meta.env.DEV) {
    return `/__tharwa_api${p}`
  }
  return `${getPublicApiBase()}${p}`
}

export function apiBaseLabel(): string {
  const target = (
    import.meta.env.VITE_BACKEND_PROXY_TARGET?.trim() || 'http://127.0.0.1:3000'
  ).replace(/\/$/, '')
  if (import.meta.env.DEV) {
    return `Dev: /__tharwa_api → ${target}`
  }
  return getPublicApiBase()
}

export type ApiErrorBody = { code?: string; message?: string }

export async function readApiError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as ApiErrorBody
    return data.message ?? `Request failed (${res.status})`
  } catch {
    return `Request failed (${res.status})`
  }
}

export function withNetworkHint(message: string): string {
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return `${message}\n\nTip: start backend-api (port 3000) or run \`npm run dev\` from the sarwa repo root.`
  }
  return message
}
