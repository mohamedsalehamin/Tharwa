import { useMemo } from 'react'
import { useLayout } from '@/context/layout-provider'
import { userDisplayName } from '@/lib/route-auth'
import { useAuthStore } from '@/stores/auth-store'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from '@/components/ui/sidebar'
import { sidebarData } from './data/sidebar-data'
import { NavGroup } from './nav-group'
import { NavUser } from './nav-user'
import { TeamSwitcher } from './team-switcher'
import { type NavGroup as NavGroupType, type NavItem } from './types'

function filterNavItems(items: NavItem[], role: string | undefined): NavItem[] {
  return items
    .map((item) => {
      if ('items' in item && item.items) {
        const children = filterNavItems(item.items, role)
        if (children.length === 0) return null
        return { ...item, items: children }
      }
      if (item.roles && (!role || !item.roles.includes(role as never))) {
        return null
      }
      return item
    })
    .filter((item): item is NavItem => item !== null)
}

export function AppSidebar() {
  const { collapsible, variant } = useLayout()
  const user = useAuthStore((s) => s.auth.user)
  const role = user?.role

  const navGroups = useMemo(() => {
    return sidebarData.navGroups
      .map((group) => ({
        ...group,
        items: filterNavItems(group.items, role),
      }))
      .filter((g) => g.items.length > 0) as NavGroupType[]
  }, [role])

  const navUser = {
    name: userDisplayName(user),
    email: user?.email ?? '',
    avatar: '',
    role: user?.role,
  }

  return (
    <Sidebar collapsible={collapsible} variant={variant}>
      <SidebarHeader>
        <TeamSwitcher teams={sidebarData.teams} />
      </SidebarHeader>
      <SidebarContent>
        {navGroups.map((props) => (
          <NavGroup key={props.title} {...props} />
        ))}
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={navUser} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
