import AuthGuard from '@/components/auth/AuthGuard';
import { MobileSidebarProvider } from '@/lib/mobile-sidebar-context';
import { ToastProvider } from '@/lib/toast-context';
import { SidebarProvider } from '@/lib/sidebar-context';
import DashboardShell from './DashboardShell';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <MobileSidebarProvider>
        <ToastProvider>
          <SidebarProvider>
            <DashboardShell>
              {children}
            </DashboardShell>
          </SidebarProvider>
        </ToastProvider>
      </MobileSidebarProvider>
    </AuthGuard>
  );
}
