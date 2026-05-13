'use client';

import { useSidebar } from '@/lib/sidebar-context';
import Sidebar from '@/components/layout/Sidebar';
import { CommandPalette } from '@/components/CommandPalette';
import { ShortcutsCheatsheet } from '@/components/ShortcutsCheatsheet';
import { ShortcutProvider } from '@/lib/shortcuts';
import styles from './layout.module.css';

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();
  return (
    <ShortcutProvider>
      <div className={styles.wrapper}>
        <Sidebar />
        <main className={`${styles.main} ${collapsed ? styles.mainCollapsed : ''}`}>
          {children}
        </main>
        <CommandPalette />
        <ShortcutsCheatsheet />
      </div>
    </ShortcutProvider>
  );
}
