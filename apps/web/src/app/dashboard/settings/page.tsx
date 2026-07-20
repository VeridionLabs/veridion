'use client';

import { Bell, Key, Palette, Shield, User, Wallet } from 'lucide-react';
import { useState } from 'react';

import { ApiKeysList } from '@/components/settings/api-keys-list';
import { ProfileForm } from '@/components/settings/profile-form';
import { WalletSection } from '@/components/settings/wallet-section';

const tabs = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'wallet', label: 'Wallet', icon: Wallet },
  { id: 'api-keys', label: 'API Keys', icon: Key },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'appearance', label: 'Appearance', icon: Palette },
] as const;

type TabId = (typeof tabs)[number]['id'];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('profile');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your account, wallet, API keys, and preferences.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-4">
        {/* Sidebar navigation */}
        <div className="bg-card h-fit rounded-xl border p-2">
          <nav className="space-y-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Main content */}
        <div className="min-w-0 space-y-6 lg:col-span-3">
          {activeTab === 'profile' && <ProfileForm />}

          {activeTab === 'wallet' && <WalletSection />}

          {activeTab === 'api-keys' && <ApiKeysList />}

          {activeTab === 'notifications' && (
            <div className="bg-card rounded-xl border p-6">
              <div className="flex items-start gap-3">
                <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-lg">
                  <Bell className="text-primary h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Notification Preferences</h2>
                  <p className="text-muted-foreground mt-1 text-sm">
                    Configure which notifications you receive.
                  </p>
                </div>
              </div>

              <div className="mt-6 space-y-4">
                <label className="hover:bg-muted/50 flex items-center gap-3 rounded-lg border p-4 transition-colors">
                  <input
                    type="checkbox"
                    className="border-input text-primary focus:ring-ring h-4 w-4 rounded"
                    defaultChecked
                  />
                  <div>
                    <span className="text-sm font-medium">
                      Email notifications for audit completion
                    </span>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      Receive an email when an audit completes successfully.
                    </p>
                  </div>
                </label>
                <label className="hover:bg-muted/50 flex items-center gap-3 rounded-lg border p-4 transition-colors">
                  <input
                    type="checkbox"
                    className="border-input text-primary focus:ring-ring h-4 w-4 rounded"
                    defaultChecked
                  />
                  <div>
                    <span className="text-sm font-medium">Critical finding alerts</span>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      Get notified immediately when critical vulnerabilities are found.
                    </p>
                  </div>
                </label>
                <label className="hover:bg-muted/50 flex items-center gap-3 rounded-lg border p-4 transition-colors">
                  <input
                    type="checkbox"
                    className="border-input text-primary focus:ring-ring h-4 w-4 rounded"
                  />
                  <div>
                    <span className="text-sm font-medium">Weekly security digest</span>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      Receive a weekly summary of all your project security statuses.
                    </p>
                  </div>
                </label>
              </div>

              <div className="bg-muted/30 mt-6 rounded-lg border p-4">
                <p className="text-muted-foreground text-sm">
                  <Shield className="text-primary mr-1 inline h-4 w-4" />
                  Notification preferences are saved locally. Full sync coming soon.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'appearance' && (
            <div className="bg-card rounded-xl border p-6">
              <div className="flex items-start gap-3">
                <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-lg">
                  <Palette className="text-primary h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Appearance</h2>
                  <p className="text-muted-foreground mt-1 text-sm">
                    Customize the look and feel of Veridion.
                  </p>
                </div>
              </div>

              <div className="mt-6 space-y-4">
                <label className="hover:bg-muted/50 flex items-center gap-3 rounded-lg border p-4 transition-colors">
                  <input
                    type="radio"
                    name="theme"
                    className="text-primary focus:ring-ring h-4 w-4"
                    defaultChecked
                  />
                  <div>
                    <span className="text-sm font-medium">Dark Mode</span>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      Default theme. Easy on the eyes for late-night coding.
                    </p>
                  </div>
                </label>
                <label className="hover:bg-muted/50 flex items-center gap-3 rounded-lg border p-4 transition-colors">
                  <input
                    type="radio"
                    name="theme"
                    className="text-primary focus:ring-ring h-4 w-4"
                  />
                  <div>
                    <span className="text-sm font-medium">Light Mode</span>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      Bright theme for daytime use.
                    </p>
                  </div>
                </label>
              </div>

              <div className="bg-muted/30 mt-6 rounded-lg border p-4">
                <p className="text-muted-foreground text-sm">
                  <Shield className="text-primary mr-1 inline h-4 w-4" />
                  Theme switching is managed by your system preferences by default.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
