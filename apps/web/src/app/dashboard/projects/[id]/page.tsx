'use client';

import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileCode,
  Github,
  Play,
  Plus,
  Shield,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

const project = {
  id: '1',
  name: 'DeFi Protocol v2',
  description:
    'A decentralized exchange protocol with liquidity pools, staking, and yield farming capabilities.',
  chain: 'Ethereum',
  language: 'Solidity',
  repoUrl: 'https://github.com/defi/protocol-v2',
  contracts: 12,
  audits: 5,
  lastAudit: '2024-06-15',
  securityScore: 82,
  createdAt: '2024-02-10',
};

const contracts = [
  { name: 'LiquidityPool.sol', lines: 342, hash: '0xabc...123', lastModified: '2024-06-14' },
  { name: 'StakingRewards.sol', lines: 218, hash: '0xdef...456', lastModified: '2024-06-12' },
  { name: 'YieldFarm.sol', lines: 456, hash: '0x789...abc', lastModified: '2024-06-10' },
  { name: 'Governance.sol', lines: 189, hash: '0xfed...cba', lastModified: '2024-06-08' },
];

const audits = [
  { id: 'a1', status: 'COMPLETED', score: 82, findings: 14, date: '2024-06-15' },
  { id: 'a2', status: 'VERIFIED', score: 93, findings: 3, date: '2024-06-01' },
  { id: 'a3', status: 'COMPLETED', score: 78, findings: 21, date: '2024-05-15' },
];

const statusIcon: Record<string, React.ElementType> = {
  COMPLETED: CheckCircle2,
  SCANNING: Clock,
  VERIFIED: Shield,
  FAILED: AlertTriangle,
  PENDING: Clock,
};

const statusColor: Record<string, string> = {
  COMPLETED: 'text-emerald-500',
  SCANNING: 'text-blue-500',
  VERIFIED: 'text-violet-500',
  FAILED: 'text-red-500',
  PENDING: 'text-amber-500',
};

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = params.id as string;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/projects"
          className="text-muted-foreground hover:bg-muted hover:text-foreground rounded-lg p-2 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 text-primary flex h-12 w-12 items-center justify-center rounded-xl text-xl font-bold">
              {project.name.charAt(0)}
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
              <p className="text-muted-foreground mt-0.5">
                {project.chain} · {project.language} · {project.contracts} contracts
              </p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/dashboard/audits?projectId=${projectId}`}
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          >
            <Play className="h-4 w-4" /> New Audit
          </Link>
        </div>
      </div>

      {project.description && (
        <div className="bg-card rounded-xl border p-6 shadow-sm">
          <p className="text-sm leading-relaxed">{project.description}</p>
          {project.repoUrl && (
            <a
              href={project.repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary mt-3 inline-flex items-center gap-1.5 text-sm hover:underline"
            >
              <Github className="h-4 w-4" />
              {project.repoUrl.replace('https://github.com/', '')}
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        {[
          {
            label: 'Security Score',
            value: `${project.securityScore}/100`,
            color: 'text-emerald-500',
          },
          { label: 'Contracts', value: project.contracts, color: 'text-blue-500' },
          { label: 'Audits', value: project.audits, color: 'text-violet-500' },
          { label: 'Created', value: project.createdAt, color: 'text-muted-foreground' },
        ].map((stat) => (
          <div key={stat.label} className="bg-card rounded-xl border p-4 shadow-sm">
            <p className="text-muted-foreground text-xs font-medium">{stat.label}</p>
            <p className={`mt-1 text-2xl font-bold ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="bg-card rounded-xl border shadow-sm">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="font-semibold">Contracts</h2>
              <button className="text-primary inline-flex items-center gap-1.5 text-sm hover:underline">
                <Plus className="h-4 w-4" /> Add Contract
              </button>
            </div>
            <div className="divide-y">
              {contracts.map((contract) => (
                <div
                  key={contract.name}
                  className="hover:bg-muted/50 flex items-center justify-between px-6 py-3 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <FileCode className="text-muted-foreground h-4 w-4" />
                    <div>
                      <p className="text-sm font-medium">{contract.name}</p>
                      <p className="text-muted-foreground text-xs">
                        {contract.lines} lines · {contract.hash}
                      </p>
                    </div>
                  </div>
                  <span className="text-muted-foreground text-xs">{contract.lastModified}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card rounded-xl border shadow-sm">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="font-semibold">Audits</h2>
              <Link href="/dashboard/audits" className="text-primary text-sm hover:underline">
                View all
              </Link>
            </div>
            <div className="divide-y">
              {audits.map((audit) => {
                const Icon = statusIcon[audit.status] ?? Clock;
                const color = statusColor[audit.status] ?? 'text-muted-foreground';
                return (
                  <Link
                    key={audit.id}
                    href={`/dashboard/audits/${audit.id}`}
                    className="hover:bg-muted/50 flex items-center justify-between px-6 py-3 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`inline-flex items-center gap-1 text-sm ${color}`}>
                        <Icon className="h-4 w-4" /> {audit.status}
                      </span>
                      <span className="text-muted-foreground text-sm">
                        {audit.findings} findings
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-medium">{audit.score}/100</span>
                      <span className="text-muted-foreground text-xs">{audit.date}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-card rounded-xl border p-6 shadow-sm">
            <h3 className="font-semibold">Quick Actions</h3>
            <div className="mt-4 space-y-2">
              <button className="hover:bg-muted w-full rounded-lg border px-4 py-2.5 text-left text-sm font-medium transition-colors">
                <Play className="mr-2 inline h-4 w-4" />
                Run Full Audit
              </button>
              <button className="hover:bg-muted w-full rounded-lg border px-4 py-2.5 text-left text-sm font-medium transition-colors">
                <FileCode className="mr-2 inline h-4 w-4" />
                Upload Contract
              </button>
              <button className="hover:bg-muted w-full rounded-lg border px-4 py-2.5 text-left text-sm font-medium transition-colors">
                <Shield className="mr-2 inline h-4 w-4" />
                Verify on Stellar
              </button>
            </div>
          </div>

          <div className="bg-card rounded-xl border p-6 shadow-sm">
            <h3 className="font-semibold">Security Summary</h3>
            <div className="mt-4 space-y-3">
              {[
                { severity: 'CRITICAL', count: 0, color: 'bg-red-500' },
                { severity: 'HIGH', count: 3, color: 'bg-orange-500' },
                { severity: 'MEDIUM', count: 7, color: 'bg-yellow-500' },
                { severity: 'LOW', count: 4, color: 'bg-green-500' },
              ].map((item) => (
                <div key={item.severity} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${item.color}`} />
                    {item.severity}
                  </div>
                  <span className="text-muted-foreground font-mono">{item.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
