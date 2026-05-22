import { create } from 'zustand'
import { getCookie, removeCookie, setCookie } from '@/lib/cookies'
import type { AdminRole } from '@/lib/admin-roles'

const ACCESS_TOKEN_KEY = 'tharwa_admin_access_token'
const USER_KEY = 'tharwa_admin_user'

export type AdminUser = {
  id: string
  email: string
  role: AdminRole
}

interface AuthState {
  auth: {
    user: AdminUser | null
    setUser: (user: AdminUser | null) => void
    accessToken: string
    setAccessToken: (accessToken: string) => void
    reset: () => void
  }
}

function readStoredUser(): AdminUser | null {
  const raw = getCookie(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AdminUser
  } catch {
    return null
  }
}

export const useAuthStore = create<AuthState>()((set) => {
  const cookieToken = getCookie(ACCESS_TOKEN_KEY)
  const initToken = cookieToken ? JSON.parse(cookieToken) : ''
  return {
    auth: {
      user: readStoredUser(),
      setUser: (user) =>
        set((state) => {
          if (user) setCookie(USER_KEY, JSON.stringify(user))
          else removeCookie(USER_KEY)
          return { ...state, auth: { ...state.auth, user } }
        }),
      accessToken: typeof initToken === 'string' ? initToken : '',
      setAccessToken: (accessToken) =>
        set((state) => {
          setCookie(ACCESS_TOKEN_KEY, JSON.stringify(accessToken))
          return { ...state, auth: { ...state.auth, accessToken } }
        }),
      reset: () =>
        set((state) => {
          removeCookie(ACCESS_TOKEN_KEY)
          removeCookie(USER_KEY)
          return {
            ...state,
            auth: { ...state.auth, user: null, accessToken: '' },
          }
        }),
    },
  }
})
