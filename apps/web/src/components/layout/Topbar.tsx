'use client';

import { useMemo } from 'react';
import { Menu } from 'lucide-react';
import { useMobileSidebar } from '@/lib/mobile-sidebar-context';
import { useAuth } from '@/lib/auth-context';
import { useShortcutContext } from '@/lib/shortcuts';
import styles from './Topbar.module.css';

interface TopbarProps {
  title: string;
  subtitle?: string;
}

export default function Topbar({ title, subtitle }: TopbarProps) {
  const { toggle } = useMobileSidebar();
  const { user } = useAuth();
  const { setPaletteOpen } = useShortcutContext();
  const today = useMemo(
    () => new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date()),
    []
  );
  const initials = useMemo(() => {
    if (user?.name) {
      return user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
    }
    if (user?.email) {
      return user.email.slice(0, 2).toUpperCase();
    }
    return 'TV';
  }, [user]);

  return (
    <header className={styles.topbar}>
      <div className={styles.left}>
        <button className={styles.menuBtn} onClick={toggle} aria-label="Open menu">
          <Menu size={20} />
        </button>
        <div className={styles.titleGroup}>
          <h1 className={styles.title}>{title}</h1>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>
      </div>
      <div className={styles.right}>
        <button type="button" className={styles.searchPill} onClick={() => setPaletteOpen(true)}>
          <span>Search...</span>
          <kbd>⌘K</kbd>
        </button>
        <div className={styles.datePill}>
          <span className={styles.dateLabel}>Today</span>
          <span className={styles.dateValue}>{today}</span>
        </div>
        <div className={styles.avatar} title={user?.name ?? user?.email ?? ''}>
          <span>{initials}</span>
        </div>
      </div>
    </header>
  );
}
