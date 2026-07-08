'use client';

import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  FileCode,
  MessageSquare,
  Shield,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

const audit = {
  id: 'a1',
  projectId: '1',
  projectName: 'DeFi Protocol v2',
  status: 'COMPLETED',
  score: 82,
  commitHash: '0xabc123def456',
  reportHash: 'report-a1',
  startedAt: '2024-06-15 10:00',
  completedAt: '2024-06-15 10:32',
  duration: '32 min',
  chain: 'Ethereum',
  language: 'Solidity',
};

const findings = [
  {
    id: 'f1',
    title: 'Reentrancy vulnerability in withdraw function',
    pluginId: 'reentrancy',
    severity: 'CRITICAL',
    filePath: 'LiquidityPool.sol',
    lineStart: 45,
    lineEnd: 58,
    codeSnippet: `function withdraw(uint256 amount) external {\n  require(balances[msg.sender] >= amount, "Insufficient balance");\n  (bool success, ) = msg.sender.call{value: amount}("");\n  require(success, "Transfer failed");\n  balances[msg.sender] -= amount;\n}`,
    recommendation:
      'Update the balance before making the external call. Use the Checks-Effects-Interactions pattern to prevent reentrancy attacks.',
    aiSummary:
      'This is a classic reentrancy vulnerability where the state update (balance deduction) occurs after the external call. An attacker could re-enter the withdraw function before their balance is updated, draining funds.',
    confidence: 0.95,
    status: 'OPEN',
    references: [
      'https://swcregistry.io/docs/SWC-107',
      'https://consensys.github.io/smart-contract-best-practices/attacks/reentrancy/',
    ],
  },
  {
    id: 'f2',
    title: 'Unchecked return value from external call',
    pluginId: 'access-control',
    severity: 'HIGH',
    filePath: 'LiquidityPool.sol',
    lineStart: 102,
    lineEnd: 112,
    codeSnippet: `function transferOwnership(address newOwner) external {\n  require(msg.sender == owner, "Not owner");\n  pendingOwner = newOwner;\n}`,
    recommendation:
      'Implement a two-step ownership transfer pattern with a confirmation step from the new owner to prevent accidental transfers.',
    aiSummary:
      'The single-step ownership transfer can lead to permanent loss of control if the wrong address is provided. A two-step pattern with acceptOwnership() from the new owner is recommended.',
    confidence: 0.88,
    status: 'ACKNOWLEDGED',
    references: [
      'https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/access/Ownable2Step.sol',
    ],
  },
  {
    id: 'f3',
    title: 'Gas inefficient loop in batchTransfer',
    pluginId: 'gas',
    severity: 'GAS',
    filePath: 'StakingRewards.sol',
    lineStart: 78,
    lineEnd: 90,
    codeSnippet: `function batchTransfer(address[] calldata recipients, uint256[] calldata amounts) external {\n  for (uint256 i = 0; i < recipients.length; i++) {\n    balances[recipients[i]] += amounts[i];\n  }\n}`,
    recommendation:
      'Cache the array length before the loop and consider using unchecked blocks for arithmetic operations where overflow is not a concern in Solidity 0.8+.',
    aiSummary:
      'Reading recipients.length on each iteration costs extra gas. Caching it in a local variable reduces gas costs significantly for large arrays.',
    confidence: 0.72,
    status: 'OPEN',
    references: [],
  },
  {
    id: 'f4',
    title: 'Missing zero-address validation',
    pluginId: 'access-control',
    severity: 'LOW',
    filePath: 'Governance.sol',
    lineStart: 15,
    lineEnd: 19,
    codeSnippet: `function setAdmin(address newAdmin) external onlyOwner {\n  admin = newAdmin;\n}`,
    recommendation:
      'Add a check to prevent setting admin to address(0) which would permanently lose admin capabilities.',
    aiSummary:
      'Setting a privileged role to the zero address results in permanent loss of that functionality. Always validate address parameters.',
    confidence: 0.99,
    status: 'RESOLVED',
    references: [],
  },
  {
    id: 'f5',
    title: 'Unprotected selfdestruct',
    pluginId: 'access-control',
    severity: 'MEDIUM',
    filePath: 'YieldFarm.sol',
    lineStart: 200,
    lineEnd: 205,
    codeSnippet: `function emergencyStop() external {\n  selfdestruct(payable(msg.sender));\n}`,
    recommendation:
      'Add an onlyOwner or multi-signature requirement to selfdestruct to prevent unauthorized destruction of the contract.',
    aiSummary:
      'Anyone can call selfdestruct and destroy the contract, taking all funds and rendering the protocol unusable. Restrict this to the owner or a multisig.',
    confidence: 0.85,
    status: 'OPEN',
    references: [
      'https://docs.soliditylang.org/en/latest/security-considerations.html#selfdestruct',
    ],
  },
];

const severityConfig: Record<string, { color: string; bg: string; border: string }> = {
  CRITICAL: { color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/30' },
  HIGH: { color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/30' },
  MEDIUM: { color: 'text-yellow-500', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30' },
  LOW: { color: 'text-green-500', bg: 'bg-green-500/10', border: 'border-green-500/30' },
  GAS: { color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/30' },
};

const statusIcon: Record<string, React.ElementType> = {
  COMPLETED: CheckCircle2,
  VERIFIED: Shield,
  SCANNING: Clock,
  FAILED: XCircle,
  PENDING: Clock,
};

const statusColor: Record<string, string> = {
  COMPLETED: 'text-emerald-500',
  VERIFIED: 'text-violet-500',
  SCANNING: 'text-blue-500',
  FAILED: 'text-red-500',
  PENDING: 'text-amber-500',
};

export default function AuditDetailPage() {
  const params = useParams();
  const _auditId = params.id as string;
  const StatusIcon = statusIcon[audit.status] ?? Clock;

  const severityCounts = findings.reduce(
    (acc, f) => {
      acc[f.severity] = (acc[f.severity] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/audits"
          className="text-muted-foreground hover:bg-muted hover:text-foreground rounded-lg p-2 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">Audit Detail</h1>
          <p className="text-muted-foreground mt-1">
            <Link href={`/dashboard/projects/${audit.projectId}`} className="hover:text-primary">
              {audit.projectName}
            </Link>{' '}
            · {audit.chain}
          </p>
        </div>
        <div className="flex gap-2">
          <button className="hover:bg-muted inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors">
            <Download className="h-4 w-4" /> Export
          </button>
          <button className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors">
            <Shield className="h-4 w-4" /> Verify on-chain
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        {[
          {
            label: 'Security Score',
            value: `${audit.score}/100`,
            color:
              audit.score >= 80
                ? 'text-emerald-500'
                : audit.score >= 50
                  ? 'text-amber-500'
                  : 'text-red-500',
          },
          {
            label: 'Status',
            value: audit.status,
            color: statusColor[audit.status] ?? '',
            icon: StatusIcon,
          },
          { label: 'Findings', value: findings.length, color: 'text-violet-500' },
          { label: 'Duration', value: audit.duration, color: 'text-blue-500' },
          {
            label: 'Completed',
            value: audit.completedAt?.split(' ')[0] ?? '—',
            color: 'text-muted-foreground',
          },
        ].map((stat) => (
          <div key={stat.label} className="bg-card rounded-xl border p-4 shadow-sm">
            <p className="text-muted-foreground text-xs font-medium">{stat.label}</p>
            <p className={`mt-1 text-2xl font-bold ${stat.color}`}>
              {stat.icon && <stat.icon className="mr-1 inline h-5 w-5" />}
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-4">
        <h2 className="text-xl font-bold">Findings ({findings.length})</h2>
        <div className="flex gap-1.5">
          {Object.entries(severityCounts).map(([severity, count]) => {
            const config = severityConfig[severity];
            return (
              <span
                key={severity}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${config?.bg ?? ''} ${config?.color ?? ''}`}
              >
                {severity} {count}
              </span>
            );
          })}
        </div>
      </div>

      <div className="space-y-4">
        {findings.map((finding) => {
          const config = severityConfig[finding.severity] ?? severityConfig.LOW;
          return (
            <div
              key={finding.id}
              className={`bg-card rounded-xl border shadow-sm ${config?.border ?? ''}`}
            >
              <div className="flex items-start justify-between border-b px-6 py-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${config?.bg ?? ''} ${config?.color ?? ''}`}
                    >
                      {finding.severity}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {finding.filePath}:{finding.lineStart}-{finding.lineEnd}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {(finding.confidence * 100).toFixed(0)}% confidence
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold">{finding.title}</h3>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    finding.status === 'OPEN'
                      ? 'bg-red-500/10 text-red-500'
                      : finding.status === 'ACKNOWLEDGED'
                        ? 'bg-amber-500/10 text-amber-500'
                        : finding.status === 'RESOLVED'
                          ? 'bg-emerald-500/10 text-emerald-500'
                          : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {finding.status}
                </span>
              </div>

              <div className="space-y-4 px-6 py-4">
                {finding.aiSummary && (
                  <div className="bg-muted/50 rounded-lg p-4">
                    <div className="flex items-start gap-2">
                      <MessageSquare className="text-primary mt-0.5 h-4 w-4 shrink-0" />
                      <div>
                        <p className="text-primary text-xs font-medium">AI Analysis</p>
                        <p className="mt-1 text-sm leading-relaxed">{finding.aiSummary}</p>
                      </div>
                    </div>
                  </div>
                )}

                {finding.codeSnippet && (
                  <div>
                    <p className="text-muted-foreground mb-2 text-xs font-medium">
                      <FileCode className="mr-1 inline h-3.5 w-3.5" />
                      Vulnerable Code
                    </p>
                    <pre className="overflow-x-auto rounded-lg bg-zinc-950 p-4 text-sm text-zinc-100">
                      <code>{finding.codeSnippet}</code>
                    </pre>
                  </div>
                )}

                {finding.recommendation && (
                  <div>
                    <p className="text-muted-foreground mb-1 text-xs font-medium">Recommendation</p>
                    <p className="text-sm leading-relaxed">{finding.recommendation}</p>
                  </div>
                )}

                {finding.references.length > 0 && (
                  <div>
                    <p className="text-muted-foreground mb-1 text-xs font-medium">References</p>
                    <div className="flex flex-wrap gap-2">
                      {finding.references.map((ref) => (
                        <a
                          key={ref}
                          href={ref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-muted hover:bg-muted/80 inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-colors"
                        >
                          {ref.length > 50 ? `${ref.slice(0, 50)}...` : ref}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
