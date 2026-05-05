'use client';

import { useSidebar } from '@/lib/sidebar-context';
import Sidebar from '@/components/layout/Sidebar';
import styles from './layout.module.css';

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();
  return (
    <div className={styles.wrapper}>
      <Sidebar />
      <main className={`${styles.main} ${collapsed ? styles.mainCollapsed : ''}`}>
        {children}
      </main>
    </div>
  );
}
