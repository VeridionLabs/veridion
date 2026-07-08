import { Activity, AlertTriangle, CheckCircle2, Shield } from 'lucide-react';

const stats = [
  { label: 'Total Projects', value: '12', icon: Shield, color: 'text-violet-500' },
  { label: 'Audits Completed', value: '47', icon: CheckCircle2, color: 'text-emerald-500' },
  { label: 'Vulnerabilities Found', value: '128', icon: AlertTriangle, color: 'text-amber-500' },
  { label: 'Avg Security Score', value: '76/100', icon: Activity, color: 'text-blue-500' },
];

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Welcome back. Here's your security overview.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-card rounded-xl border p-6 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm font-medium">{stat.label}</span>
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </div>
            <p className="mt-2 text-3xl font-bold">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="bg-card rounded-xl border p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Recent Audits</h2>
          <p className="text-muted-foreground mt-4 text-sm">
            Connect your wallet and create a project to get started with your first smart contract
            audit.
          </p>
        </div>
        <div className="bg-card rounded-xl border p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Security Score Trend</h2>
          <p className="text-muted-foreground mt-4 text-sm">
            Your security score trends will appear here once you have completed audits.
          </p>
        </div>
      </div>
    </div>
  );
}
