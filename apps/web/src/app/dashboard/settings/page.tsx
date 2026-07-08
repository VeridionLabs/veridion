export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your account, API keys, and preferences.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="bg-card rounded-xl border p-6">
            <h2 className="text-lg font-semibold">Profile</h2>
            <div className="mt-4 space-y-4">
              <div>
                <label className="text-sm font-medium">Display Name</label>
                <input
                  type="text"
                  className="bg-background mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                  placeholder="Your name"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Email</label>
                <input
                  type="email"
                  className="bg-background mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                  placeholder="you@example.com"
                  disabled
                />
              </div>
              <div>
                <label className="text-sm font-medium">Wallet Address (Stellar)</label>
                <input
                  type="text"
                  className="bg-background mt-1 w-full rounded-lg border px-3 py-2 font-mono text-sm"
                  placeholder="G..."
                />
              </div>
            </div>
          </div>

          <div className="bg-card rounded-xl border p-6">
            <h2 className="text-lg font-semibold">API Keys</h2>
            <p className="text-muted-foreground mt-2 text-sm">
              Manage API keys for programmatic access to Veridion.
            </p>
            <button className="bg-primary text-primary-foreground hover:bg-primary/90 mt-4 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors">
              Generate New API Key
            </button>
          </div>
        </div>

        <div className="bg-card h-fit rounded-xl border p-6">
          <h2 className="text-lg font-semibold">Preferences</h2>
          <div className="mt-4 space-y-3">
            <label className="flex items-center gap-3">
              <input type="checkbox" className="h-4 w-4" defaultChecked />
              <span className="text-sm">Email notifications for audit completion</span>
            </label>
            <label className="flex items-center gap-3">
              <input type="checkbox" className="h-4 w-4" defaultChecked />
              <span className="text-sm">Critical finding alerts</span>
            </label>
            <label className="flex items-center gap-3">
              <input type="checkbox" className="h-4 w-4" />
              <span className="text-sm">Weekly security digest</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
