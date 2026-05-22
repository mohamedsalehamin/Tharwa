import {
  Bell,
  Layers,
  LayoutDashboard,
  Megaphone,
  ScrollText,
  Settings,
  Shield,
  Users,
} from 'lucide-react'
import { type SidebarData } from '../types'

export const sidebarData: SidebarData = {
  user: {
    name: 'Admin',
    email: 'admin@localhost.com',
    avatar: '',
  },
  teams: [
    {
      name: 'Tharwa',
      logo: Shield,
      plan: 'Administration',
    },
  ],
  navGroups: [
    {
      title: 'Operations',
      items: [
        {
          title: 'Dashboard',
          url: '/',
          icon: LayoutDashboard,
        },
        {
          title: 'Instruments',
          url: '/instruments',
          icon: Layers,
        },
        {
          title: 'Users',
          url: '/users',
          icon: Users,
        },
        {
          title: 'Activity',
          url: '/activity',
          icon: ScrollText,
        },
        {
          title: 'Announcements',
          url: '/announcements',
          icon: Megaphone,
        },
        {
          title: 'Push notifications',
          url: '/push',
          icon: Bell,
        },
        {
          title: 'Integrations',
          url: '/settings/integrations',
          icon: Settings,
        },
      ],
    },
  ],
}
