'use client';

import {
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
  Eye,
  FileJson,
  FileText,
  Share2,
  Shield,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';

const reports = [
  {
    id: 'r1',
    auditId: 'a1',
    projectName: 'DeFi Protocol v2',
    auditDate: '2024-06-15',
    securityScore: 82,
    findings: 14,
    status: 'COMPLETED',
    formats: ['PDF', 'MARKDOWN', 'HTML', 'JSON'],
    generatedAt: '2024-06-15 10:35',
    reportHash: 'report-a1',
  },
  {
    id: 'r2',
    auditId: 'a2',
    projectName: 'Staking Rewards',
    auditDate: '2024-06-01',
    securityScore: 93,
    findings: 3,
    status: 'VERIFIED',
    formats: ['PDF', 'MARKDOWN', 'HTML', 'JSON'],
    generatedAt: '2024-06-01 14:20',
    reportHash: 'report-a2',
  },
  {
    id: 'r3',
    auditId: 'a3',
    projectName: 'NFT Marketplace',
    auditDate: '2024-05-28',
    securityScore: 78,
    findings: 8,
    status: 'COMPLETED',
    formats: ['MARKDOWN', 'JSON'],
    generatedAt: '2024-05-28 11:15',
    reportHash: 'report-a3',
  },
  {
    id: 'r4',
    auditId: 'a4',
    projectName: 'Token Vesting',
    auditDate: '2024-05-20',
    securityScore: null,
    findings: null,
    status: 'FAILED',
    formats: [],
    generatedAt: null,
    reportHash: null,
  },
];

const formatIcons: Record<string, React.ElementType> = {
  PDF: FileText,
  MARKDOWN: FileText,
  HTML: FileJson,
  JSON: FileJson,
};

const statusBadge: Record<string, { icon: React.ElementType; color: string }> = {
  COMPLETED: { icon: CheckCircle2, color: 'text-emerald-500' },
  VERIFIED: { icon: Shield, color: 'text-violet-500' },
  FAILED: { icon: Clock, color: 'text-red-500' },
};

export default function ReportsPage() {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function handleDownload(_reportId: string, format: string) {
    // TODO: Replace with actual download
    toast.success(`Downloading ${format} report...`);
  }

  function handleShare(_reportId: string) {
    toast.info('Report link copied to clipboard!');
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
        <p className="text-muted-foreground mt-1">View and download generated audit reports.</p>
      </div>

      <div className="bg-card rounded-xl border">
        <div className="divide-y">
          {reports.map((report) => {
            const isExpanded = expandedId === report.id;
            const badge = statusBadge[report.status];

            return (
              <div key={report.id} className="hover:bg-muted/20 transition-colors">
                <div
                  className="flex cursor-pointer items-center justify-between px-6 py-4"
                  onClick={() => setExpandedId(isExpanded ? null : report.id)}
                >
                  <div className="flex items-center gap-4">
                    <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-lg">
                      <FileText className="text-primary h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium">{report.projectName}</p>
                      <div className="text-muted-foreground flex items-center gap-3 text-sm">
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {report.auditDate}
                        </span>
                        {report.securityScore != null && (
                          <span>Score: {report.securityScore}/100</span>
                        )}
                        {report.findings != null && <span>{report.findings} findings</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {badge && (
                      <span className={`inline-flex items-center gap-1 text-sm ${badge.color}`}>
                        <badge.icon className="h-4 w-4" />
                        {report.status}
                      </span>
                    )}
                    <ChevronDown
                      className={`text-muted-foreground h-4 w-4 transition-transform ${
                        isExpanded ? 'rotate-180' : ''
                      }`}
                    />
                  </div>
                </div>

                {isExpanded && (
                  <div className="bg-muted/10 border-t px-6 py-4">
                    <div className="grid gap-4 text-sm sm:grid-cols-2">
                      <div>
                        <p className="text-muted-foreground font-medium">Audit ID</p>
                        <Link
                          href={`/dashboard/audits/${report.auditId}`}
                          className="text-primary mt-0.5 font-mono hover:underline"
                        >
                          {report.auditId}
                        </Link>
                      </div>
                      <div>
                        <p className="text-muted-foreground font-medium">Report Hash</p>
                        <p className="text-muted-foreground mt-0.5 font-mono">
                          {report.reportHash ?? 'N/A'}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground font-medium">Generated</p>
                        <p className="mt-0.5">{report.generatedAt ?? 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground font-medium">Available Formats</p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {report.formats.length > 0 ? (
                            report.formats.map((fmt) => {
                              const Icon = formatIcons[fmt] ?? FileText;
                              return (
                                <button
                                  key={fmt}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDownload(report.id, fmt);
                                  }}
                                  className="bg-background hover:bg-muted inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors"
                                >
                                  <Icon className="h-3 w-3" />
                                  {fmt}
                                </button>
                              );
                            })
                          ) : (
                            <span className="text-muted-foreground">None</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex gap-2">
                      <Link
                        href={`/dashboard/audits/${report.auditId}`}
                        className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
                      >
                        <Eye className="h-4 w-4" /> View Audit
                      </Link>
                      <button
                        onClick={() => handleShare(report.id)}
                        className="hover:bg-muted inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
                      >
                        <Share2 className="h-4 w-4" /> Share
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
