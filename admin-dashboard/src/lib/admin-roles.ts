export const ADMIN_ROLES = ['superadmin', 'operator'] as const
export type AdminRole = (typeof ADMIN_ROLES)[number]

export function isAdminRole(value: string): value is AdminRole {
  return (ADMIN_ROLES as readonly string[]).includes(value)
}

export function isSuperadmin(role: string | undefined): boolean {
  return role === 'superadmin'
}
