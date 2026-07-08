'use client';

import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  Bell, CheckCheck, AlertTriangle, CheckCircle2,
  Info, XCircle, Clock, ExternalLink,
} from 'lucide-react';

type NotificationType = 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  read: boolean;
  link: string | null;
  createdAt: string;
}

const notifications: Notification[] = [
  {
    id: 'n1',
    title: 'Audit Completed',
    message: 'Security audit for DeFi Protocol v2 has completed with a score of 82/100. 14 findings were identified.',
    type: 'SUCCESS',
    read: false,
    link: '/dashboard/audits/a1',
    createdAt: '2024-06-15 10:35',
  },
  {
    id: 'n2',
    title: 'Critical Finding Detected',
    message: 'A critical reentrancy vulnerability was found in LiquidityPool.sol:45-58. Immediate action recommended.',
    type: 'ERROR',
    read: false,
    link: '/dashboard/audits/a1',
    createdAt: '2024-06-15 10:32',
  },
  {
    id: 'n3',
    title: 'Blockchain Verification Complete',
    message: 'Your audit for Staking Rewards has been verified on Stellar Soroban. Transaction hash: stellar-tx-789012.',
    type: 'SUCCESS',
    read: false,
    link: '/dashboard/audits/a2',
    createdAt: '2024-06-03 09:15',
  },
  {
    id: 'n4',
    title: 'AI Analysis Available',
    message: 'AI-powered analysis is now available for your latest NFT Marketplace audit. Chat with AI to explore findings.',
    type: 'INFO',
    read: true,
    link: '/dashboard/ai-chat',
    createdAt: '2024-05-29 14:00',
  },
  {
    id: 'n5',
    title: 'Audit Failed',
    message: 'The audit for Token Vesting contract failed due to compilation errors. Please check your contract and try again.',
    type: 'ERROR',
    read: true,
    link: '/dashboard/audits/a4',
    createdAt: '2024-05-20 16:45',
  },
  {
    id: 'n6',
    title: 'Weekly Security Digest',
    message: 'This week: 3 audits completed, 25 findings resolved, average security score improved by 5 points.',
    type: 'INFO',
    read: true,
    link: null,
    createdAt: '2024-05-19 08:00',
  },
  {
    id: 'n7',
    title: 'New Plugin Available',
    message: 'The "Front-Running Detection" plugin has been added. Enable it in your project settings to detect MEV vulnerabilities.',
    type: 'INFO',
    read: true,
    link: '/dashboard/settings',
    createdAt: '2024-05-15 12:00',
  },
  {
    id: 'n8',
    title: 'API Key Generated',
    message: 'A new API key "production-key" was generated for programmatic access to Veridion.',
    type: 'WARNING',
    read: true,
    link: '/dashboard/settings',
    createdAt: '2024-05-10 10:30',
  },
];

const typeConfig: Record<NotificationType, { icon: React.ElementType; color: string; bg: string }> = {
  INFO: { icon: Info, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  SUCCESS: { icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  WARNING: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  ERROR: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/10' },
};

export default function NotificationsPage() {
  const [items, setItems] = useState(notifications);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const filtered = filter === 'unread' ? items.filter((n) => !n.read) : items;
  const unreadCount = items.filter((n) => !n.read).length;

  function markAsRead(id: string) {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }

  function markAllAsRead() {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    toast.success('All notifications marked as read');
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
          <p className="text-muted-foreground mt-1">
            Stay updated on audits, findings, and platform activity.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex rounded-lg bg-muted p-1">
            <button
              onClick={() => setFilter('all')}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                filter === 'all'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                filter === 'unread'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Unread ({unreadCount})
            </button>
          </div>

          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
            >
              <CheckCheck className="h-4 w-4" />
              Mark all read
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border bg-card py-16">
          <Bell className="h-12 w-12 text-muted-foreground/30" />
          <p className="mt-4 text-lg font-medium text-muted-foreground">No notifications</p>
          <p className="text-sm text-muted-foreground">
            {filter === 'unread'
              ? 'You have read all your notifications.'
              : 'You haven\'t received any notifications yet.'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card">
          <div className="divide-y">
            {filtered.map((notification) => {
              const config = typeConfig[notification.type] ?? typeConfig.INFO;
              const Icon = config.icon;

              return (
                <div
                  key={notification.id}
                  className={`group flex items-start gap-4 px-6 py-4 transition-colors hover:bg-muted/50 ${
                    !notification.read ? 'bg-muted/20' : ''
                  }`}
                >
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${config.bg}`}
                  >
                    <Icon className={`h-5 w-5 ${config.color}`} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">
                          {notification.title}
                          {!notification.read && (
                            <span className="ml-2 inline-block h-2 w-2 rounded-full bg-primary" />
                          )}
                        </p>
                        <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">
                          {notification.message}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {notification.createdAt.split(' ')[0]}
                        </span>
                      </div>
                    </div>

                    <div className="mt-2 flex items-center gap-2">
                      {notification.link && (
                        <Link
                          href={notification.link}
                          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        >
                          View details
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      )}

                      {!notification.read && (
                        <button
                          onClick={() => markAsRead(notification.id)}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Mark as read
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-card p-4 text-center">
        <p className="text-sm text-muted-foreground">
          Showing {filtered.length} of {items.length} notifications
          {unreadCount > 0 && ` · ${unreadCount} unread`}
        </p>
      </div>
    </div>
  );
}
