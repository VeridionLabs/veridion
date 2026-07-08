import { Sidebar } from '@/components/sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="bg-muted/10 flex-1 overflow-y-auto p-6 lg:p-8">{children}</main>
    </div>
  );
}
