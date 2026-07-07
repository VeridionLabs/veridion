import { Shield, Clock, CheckCircle2, XCircle } from 'lucide-react';

const audits = [
  { id: '1', project: 'DeFi Protocol v2', status: 'COMPLETED', score: 82, findings: 14, date: '2024-06-15', hash: '0xabc...def' },
  { id: '2', project: 'NFT Marketplace', status: 'SCANNING', score: null, findings: null, date: '2024-06-10', hash: '0x123...456' },
  { id: '3', project: 'Staking Rewards', status: 'VERIFIED', score: 93, findings: 3, date: '2024-05-28', hash: '0x789...012' },
  { id: '4', project: 'Token Vesting', status: 'FAILED', score: null, findings: null, date: '2024-05-20', hash: '0xdef...abc' },
];

const statusIcon = {
  COMPLETED: CheckCircle2,
  SCANNING: Clock,
  VERIFIED: Shield,
  FAILED: XCircle,
  PENDING: Clock,
};

const statusColor = {
  COMPLETED: 'text-emerald-500',
  SCANNING: 'text-blue-500',
  VERIFIED: 'text-violet-500',
  FAILED: 'text-red-500',
  PENDING: 'text-amber-500',
};

export default function AuditsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Audit History</h1>
        <p className="text-muted-foreground mt-1">Review past audits and their findings.</p>
      </div>

      <div className="rounded-xl border bg-card">
        <div className="p-6">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b text-left text-sm text-muted-foreground">
                  <th className="pb-3 font-medium">Project</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Score</th>
                  <th className="pb-3 font-medium">Findings</th>
                  <th className="pb-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {audits.map((audit) => {
                  const Icon = statusIcon[audit.status as keyof typeof statusIcon] ?? Clock;
                  const color = statusColor[audit.status as keyof typeof statusColor] ?? 'text-muted-foreground';
                  return (
                    <tr key={audit.id} className="text-sm hover:bg-muted/50 transition-colors">
                      <td className="py-3 font-medium">{audit.project}</td>
                      <td className="py-3">
                        <span className={`inline-flex items-center gap-1 ${color}`}>
                          <Icon className="h-3.5 w-3.5" /> {audit.status}
                        </span>
                      </td>
                      <td className="py-3">{audit.score ? `${audit.score}/100` : '—'}</td>
                      <td className="py-3">{audit.findings ?? '—'}</td>
                      <td className="py-3 text-muted-foreground">{audit.date}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
