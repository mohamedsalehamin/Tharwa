import {
  Bell,
  BookOpen,
  CalendarDays,
  FileText,
  Globe,
  Layers,
  LayoutDashboard,
  ListOrdered,
  Mail,
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
          title: 'Equity lists',
          url: '/equity-lists',
          icon: ListOrdered,
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
          title: 'Learn content',
          url: '/learn',
          icon: BookOpen,
        },
        {
          title: 'Contact',
          url: '/contact',
          icon: Mail,
        },
        {
          title: 'Website pages',
          url: '/website/pages',
          icon: FileText,
        },
        {
          title: 'Website navigation',
          url: '/website/navigation',
          icon: Globe,
        },
        {
          title: 'Push notifications',
          url: '/push',
          icon: Bell,
        },
        {
          title: 'EGX holidays',
          url: '/egx-holidays',
          icon: CalendarDays,
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
