'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, FolderOpen, FileSearch, MessageSquare,
  FileText, Settings, Bell, Shield, ChevronLeft,
} from 'lucide-react';
import { useState } from 'react';

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
    <aside className={cn(
      'flex h-full flex-col border-r bg-card transition-all duration-300',
      collapsed ? 'w-16' : 'w-64',
    )}>
      <div className="flex h-14 items-center justify-between border-b px-4">
        {!collapsed && (
          <Link href="/dashboard" className="flex items-center gap-2 font-bold">
            <Shield className="h-6 w-6 text-primary" />
            <span className="text-lg">Veridion</span>
          </Link>
        )}
        {collapsed && <Shield className="mx-auto h-6 w-6 text-primary" />}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="rounded-md p-1 hover:bg-muted"
        >
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

      <div className="border-t p-2 space-y-1">
        <Link
          href="/dashboard/notifications"
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors',
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
