'use client';

import {
  Bell,
  ChevronLeft,
  FileSearch,
  FileText,
  FolderOpen,
  LayoutDashboard,
  MessageSquare,
  Settings,
  Shield,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { cn } from '@/lib/utils';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Projects', href: '/dashboard/projects', icon: FolderOpen },
  { name: 'Audit History', href: '/dashboard/audits', icon: FileSearch },
  { name: 'AI Chat', href: '/dashboard/ai-chat', icon: MessageSquare },
  { name: 'Reports', href: '/dashboard/reports', icon: FileText },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        'bg-card flex h-full flex-col border-r transition-all duration-300',
        collapsed ? 'w-16' : 'w-64',
      )}
    >
      <div className="flex h-14 items-center justify-between border-b px-4">
        {!collapsed && (
          <Link href="/dashboard" className="flex items-center gap-2 font-bold">
            <Shield className="text-primary h-6 w-6" />
            <span className="text-lg">Veridion</span>
          </Link>
        )}
        {collapsed && <Shield className="text-primary mx-auto h-6 w-6" />}
        <button onClick={() => setCollapsed(!collapsed)} className="hover:bg-muted rounded-md p-1">
          <ChevronLeft className={cn('h-4 w-4 transition-transform', collapsed && 'rotate-180')} />
        </button>
      </div>

      <nav className="flex-1 space-y-1 p-2">
        {navigation.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                collapsed && 'justify-center px-2',
              )}
              title={collapsed ? item.name : undefined}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span>{item.name}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-1 border-t p-2">
        <Link
          href="/dashboard/notifications"
          className={cn(
            'text-muted-foreground hover:bg-muted hover:text-foreground flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
            collapsed && 'justify-center px-2',
          )}
        >
          <Bell className="h-5 w-5 shrink-0" />
          {!collapsed && <span>Notifications</span>}
        </Link>
      </div>
    </aside>
  );
}
