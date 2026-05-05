import Sidebar from '@/components/layout/Sidebar';
import AuthGuard from '@/components/auth/AuthGuard';
import { MobileSidebarProvider } from '@/lib/mobile-sidebar-context';
import { ToastProvider } from '@/lib/toast-context';
import styles from './layout.module.css';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <MobileSidebarProvider>
        <ToastProvider>
          <div className={styles.wrapper}>
            <Sidebar />
            <main className={styles.main}>
              {children}
            </main>
          </div>
        </ToastProvider>
      </MobileSidebarProvider>
    </AuthGuard>
  );
}
