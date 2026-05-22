import { adminFetch } from '@/lib/admin-api'
import { isAdminRole } from '@/lib/admin-roles'
import { decodeJwtPayload } from '@/lib/jwt'
import { useAuthStore } from '@/stores/auth-store'

type AdminMe = {
  id: string
  email: string
  role: string
}

/** Sync role/email from API (DB is source of truth; fixes stale cookies after migrations). */
export async function refreshAdminSession(): Promise<void> {
  const { auth } = useAuthStore.getState()
  const token = auth.accessToken
  if (!token) return

  try {
    const me = await adminFetch<AdminMe>('/admin/v1/auth/me', token)
    if (isAdminRole(me.role)) {
      auth.setUser({ id: me.id, email: me.email, role: me.role })
      return
    }
  } catch {
    // fall through to JWT payload
  }

  const payload = decodeJwtPayload(token)
  if (
    payload?.sub &&
    payload.email &&
    typeof payload.role === 'string' &&
    isAdminRole(payload.role)
  ) {
    auth.setUser({
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    })
  }
}
