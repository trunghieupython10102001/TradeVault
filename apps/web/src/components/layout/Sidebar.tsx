'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  LineChart,
  BookOpen,
  Calendar,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Plus,
  List,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useMobileSidebar } from '@/lib/mobile-sidebar-context';
import styles from './Sidebar.module.css';

const navSections = [
  {
    label: 'Overview',
    items: [
      { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { href: '/dashboard/analytics', icon: LineChart, label: 'Analytics' },
      { href: '/dashboard/calendar', icon: Calendar, label: 'Calendar' },
    ],
  },
  {
    label: 'Trading',
    items: [
      { href: '/dashboard/trades', icon: List, label: 'Trade Log' },
      { href: '/dashboard/trades/new', icon: Plus, label: 'New Trade' },
      { href: '/dashboard/journal', icon: BookOpen, label: 'Journal' },
    ],
  },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const { logout } = useAuth();
  const { isOpen: mobileOpen, close: closeMobile } = useMobileSidebar();

  return (
    <>
      {mobileOpen && (
        <div className={styles.backdrop} onClick={closeMobile} />
      )}

      <aside
        className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''} ${mobileOpen ? styles.mobileOpen : ''}`}
      >
        <div className={styles.sidebarGlow} />
        <div className={styles.logo}>
          <div className={styles.logoIcon}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <line x1="5.5" y1="1.5" x2="5.5" y2="4" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
              <rect x="2.5" y="4" width="6" height="9.5" rx="1.5" fill="white"/>
              <line x1="5.5" y1="13.5" x2="5.5" y2="16" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="14.5" y1="5.5" x2="14.5" y2="8" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.45"/>
              <rect x="11.5" y="8" width="6" height="5.5" rx="1.5" fill="white" fillOpacity="0.4"/>
              <line x1="14.5" y1="13.5" x2="14.5" y2="17" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.45"/>
            </svg>
          </div>
          {!collapsed && (
            <div className={styles.logoCopy}>
              <span className={styles.logoText}>TradeVault</span>
            </div>
          )}
        </div>

        <nav className={styles.nav}>
          {navSections.map((section) => (
            <div key={section.label} className={styles.navSection}>
              {!collapsed && (
                <span className={styles.navLabel}>{section.label}</span>
              )}
              {section.items.map((item) => {
                const allItems = navSections.flatMap((s) => s.items);
                const exactMatchExists = allItems.some(
                  (other) => other.href !== item.href && pathname === other.href
                );
                const isActive =
                  pathname === item.href ||
                  (!exactMatchExists &&
                    item.href !== '/dashboard' &&
                    pathname.startsWith(item.href + '/'));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`${styles.navItem} ${isActive ? styles.active : ''}`}
                    title={collapsed ? item.label : undefined}
                    onClick={closeMobile}
                  >
                    <item.icon size={18} className={styles.navIcon} />
                    {!collapsed && <span>{item.label}</span>}
                    <div className={styles.activeIndicator} />
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className={styles.bottom}>
          <Link
            href="/dashboard/settings"
            className={`${styles.navItem} ${pathname === '/dashboard/settings' ? styles.active : ''}`}
            title={collapsed ? 'Settings' : undefined}
            onClick={closeMobile}
          >
            <Settings size={18} className={styles.navIcon} />
            {!collapsed && <span>Settings</span>}
            <div className={styles.activeIndicator} />
          </Link>
          <button
            className={styles.collapseBtn}
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            {!collapsed && <span>Collapse</span>}
          </button>
          <button
            className={styles.navItem}
            title={collapsed ? 'Sign out' : undefined}
            onClick={logout}
          >
            <LogOut size={18} className={styles.navIcon} />
            {!collapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
