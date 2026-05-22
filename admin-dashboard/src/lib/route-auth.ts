import { redirect } from '@tanstack/react-router'
import { isAdminRole, type AdminRole } from '@/lib/admin-roles'
import { decodeJwtPayload, isTokenExpired } from '@/lib/jwt'
import { useAuthStore, type AdminUser } from '@/stores/auth-store'

export function requireAuthenticated(): void {
  const { auth } = useAuthStore.getState()
  if (!auth.accessToken || isTokenExpired(auth.accessToken)) {
    auth.reset()
    throw redirect({ to: '/sign-in' })
  }
  if (!auth.user) {
    const payload = decodeJwtPayload(auth.accessToken)
    if (payload?.sub && payload.email && typeof payload.role === 'string' && isAdminRole(payload.role)) {
      auth.setUser({
        id: payload.sub,
        email: payload.email,
        role: payload.role,
      })
    }
  }
}

export function requireRole(...roles: AdminRole[]): void {
  requireAuthenticated()
  const role = useAuthStore.getState().auth.user?.role
  if (!role || !roles.includes(role)) {
    throw redirect({ to: '/403' })
  }
}

export function userDisplayName(user: AdminUser | null): string {
  if (!user) return 'Admin'
  return user.email.split('@')[0] ?? user.email
}
