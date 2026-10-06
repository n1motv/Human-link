import {
  BarChart3,
  Bell,
  Briefcase,
  CalendarDays,
  CalendarRange,
  FileText,
  Gift,
  Home,
  Inbox,
  LifeBuoy,
  Mail,
  MessageSquareHeart,
  Network,
  Scale,
  ScrollText,
  ShieldCheck,
  Stethoscope,
  Users,
  Video,
  Wifi,
  Plane,
  type LucideIcon,
} from 'lucide-react';
import type { PublicConfig, Role } from '../lib/types';

export interface NavItem {
  to: string;
  label: string; // clé i18n
  icon: LucideIcon;
  module?: keyof PublicConfig['modules'];
  end?: boolean;
}

export interface NavGroup {
  title?: string; // clé i18n
  items: NavItem[];
}

const personal: NavItem[] = [
  { to: '/me', label: 'nav.home', icon: Home, end: true },
  { to: '/me/leaves', label: 'nav.myLeaves', icon: Plane, module: 'leaves' },
  { to: '/me/sick', label: 'nav.mySick', icon: Stethoscope, module: 'sickLeaves' },
  { to: '/me/telework', label: 'nav.telework', icon: Wifi, module: 'telework' },
  { to: '/me/meetings', label: 'nav.meetings', icon: Video, module: 'meetings' },
  { to: '/me/calendar', label: 'nav.calendar', icon: CalendarDays },
  { to: '/me/vault', label: 'nav.vault', icon: FileText, module: 'vault' },
  { to: '/me/feedback', label: 'nav.feedback', icon: MessageSquareHeart, module: 'feedback' },
];

export const NAV: Record<Role, NavGroup[]> = {
  admin: [
    {
      items: [
        { to: '/admin', label: 'nav.dashboard', icon: BarChart3, end: true },
        { to: '/admin/employees', label: 'nav.employees', icon: Users },
        { to: '/admin/org', label: 'nav.org', icon: Network, module: 'orgChart' },
      ],
    },
    {
      title: 'nav.requests',
      items: [
        { to: '/admin/leaves', label: 'nav.leaves', icon: Plane, module: 'leaves' },
        { to: '/admin/sick', label: 'nav.sick', icon: Stethoscope, module: 'sickLeaves' },
        { to: '/admin/bonuses', label: 'nav.bonuses', icon: Gift, module: 'bonuses' },
      ],
    },
    {
      title: 'nav.planning',
      items: [
        { to: '/admin/calendar', label: 'nav.teamCalendar', icon: CalendarRange },
        { to: '/admin/vault', label: 'nav.vault', icon: FileText, module: 'vault' },
      ],
    },
    {
      title: 'nav.insights',
      items: [
        { to: '/admin/feedback', label: 'nav.feedbackResults', icon: MessageSquareHeart, module: 'feedback' },
        { to: '/admin/contacts', label: 'nav.contacts', icon: Inbox, module: 'contact' },
        { to: '/admin/audit', label: 'nav.audit', icon: ScrollText },
        { to: '/admin/compliance', label: 'nav.compliance', icon: Scale },
        { to: '/admin/mail', label: 'nav.mail', icon: Mail },
      ],
    },
  ],
  manager: [
    {
      title: 'nav.management',
      items: [
        { to: '/manager', label: 'nav.team', icon: Users, end: true },
        { to: '/manager/leaves', label: 'nav.teamLeaves', icon: Plane, module: 'leaves' },
        { to: '/manager/bonuses', label: 'nav.bonuses', icon: Gift, module: 'bonuses' },
        { to: '/manager/meetings', label: 'nav.organize', icon: Briefcase, module: 'meetings' },
        { to: '/manager/calendar', label: 'nav.teamCalendar', icon: CalendarRange },
      ],
    },
    { title: 'nav.mySpace', items: personal },
  ],
  employe: [{ items: personal }],
};

export const COMMON_NAV: NavItem[] = [
  { to: '/notifications', label: 'nav.notifications', icon: Bell },
  { to: '/security', label: 'nav.security', icon: ShieldCheck },
  { to: '/support', label: 'nav.contact', icon: LifeBuoy, module: 'contact' },
];

/** Barre du bas sur téléphone : les destinations les plus fréquentes de chaque rôle (voir BottomNav). */
export const BOTTOM_NAV: Record<Role, NavItem[]> = {
  employe: [
    { to: '/me', label: 'nav.short.home', icon: Home, end: true },
    { to: '/me/leaves', label: 'nav.short.leaves', icon: Plane, module: 'leaves' },
    { to: '/me/calendar', label: 'nav.short.calendar', icon: CalendarDays },
    { to: '/notifications', label: 'nav.short.alerts', icon: Bell },
  ],
  manager: [
    { to: '/manager', label: 'nav.short.team', icon: Users, end: true },
    { to: '/manager/leaves', label: 'nav.short.leaves', icon: Plane, module: 'leaves' },
    { to: '/manager/calendar', label: 'nav.short.calendar', icon: CalendarRange },
    { to: '/notifications', label: 'nav.short.alerts', icon: Bell },
  ],
  admin: [
    { to: '/admin', label: 'nav.short.home', icon: BarChart3, end: true },
    { to: '/admin/leaves', label: 'nav.short.requests', icon: Plane, module: 'leaves' },
    { to: '/admin/calendar', label: 'nav.short.calendar', icon: CalendarRange },
    { to: '/notifications', label: 'nav.short.alerts', icon: Bell },
  ],
};

export const HOME: Record<Role, string> = { admin: '/admin', manager: '/manager', employe: '/me' };
