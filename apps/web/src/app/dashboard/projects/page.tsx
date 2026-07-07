import { Plus, ExternalLink, MoreHorizontal } from 'lucide-react';
import Link from 'next/link';

const projects = [
  { id: '1', name: 'DeFi Protocol v2', chain: 'Ethereum', language: 'Solidity', contracts: 12, audits: 5, lastAudit: '2024-06-15' },
  { id: '2', name: 'NFT Marketplace', chain: 'Polygon', language: 'Solidity', contracts: 8, audits: 3, lastAudit: '2024-06-10' },
  { id: '3', name: 'Staking Rewards', chain: 'BSC', language: 'Solidity', contracts: 4, audits: 2, lastAudit: '2024-05-28' },
];

export default function ProjectsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
          <p className="text-muted-foreground mt-1">Manage your smart contract projects and audits.</p>
        </div>
        <Link
          href="/dashboard/projects/new"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" /> New Project
        </Link>
      </div>

      <div className="rounded-xl border bg-card">
        <div className="p-6">
          <div className="space-y-4">
            {projects.map((project) => (
              <div key={project.id} className="flex items-center justify-between rounded-lg border p-4 hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold">
                    {project.name.charAt(0)}
                  </div>
                  <div>
                    <Link href={`/dashboard/projects/${project.id}`} className="font-medium hover:text-primary">
                      {project.name}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {project.chain} · {project.language} · {project.contracts} contracts · {project.audits} audits
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>Last audit: {project.lastAudit}</span>
                  <button className="rounded-md p-1 hover:bg-muted">
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
