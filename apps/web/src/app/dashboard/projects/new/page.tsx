'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Upload, Code2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { SUPPORTED_CHAINS, SUPPORTED_LANGUAGES } from '@veridion/shared';

export default function NewProjectPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'form' | 'paste'>('form');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name') as string,
      description: formData.get('description') as string,
      chain: formData.get('chain') as string,
      language: formData.get('language') as string,
      repoUrl: formData.get('repoUrl') as string,
    };

    // TODO: Replace with actual API call
    await new Promise((r) => setTimeout(r, 800));
    toast.success('Project created successfully!');
    router.push('/dashboard/projects');
    setLoading(false);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/projects"
          className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">New Project</h1>
          <p className="text-muted-foreground mt-1">Create a new smart contract project to audit.</p>
        </div>
      </div>

      <div className="flex gap-2 rounded-lg bg-muted p-1">
        <button
          onClick={() => setTab('form')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === 'form'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Project Details
        </button>
        <button
          onClick={() => setTab('paste')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === 'paste'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Paste Contract
        </button>
      </div>

      {tab === 'form' ? (
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="name" className="text-sm font-medium">
                Project name <span className="text-destructive">*</span>
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                maxLength={100}
                placeholder="e.g., DeFi Protocol v2"
                className="mt-1.5 w-full rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div>
              <label htmlFor="description" className="text-sm font-medium">
                Description
              </label>
              <textarea
                id="description"
                name="description"
                rows={3}
                maxLength={500}
                placeholder="Brief description of your project and its purpose..."
                className="mt-1.5 w-full rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
              <p className="mt-1 text-xs text-muted-foreground">Max 500 characters</p>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="chain" className="text-sm font-medium">
                  Blockchain <span className="text-destructive">*</span>
                </label>
                <select
                  id="chain"
                  name="chain"
                  required
                  className="mt-1.5 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Select a chain</option>
                  {SUPPORTED_CHAINS.map((c) => (
                    <option key={c} value={c}>
                      {c.charAt(0).toUpperCase() + c.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="language" className="text-sm font-medium">
                  Language <span className="text-destructive">*</span>
                </label>
                <select
                  id="language"
                  name="language"
                  required
                  className="mt-1.5 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Select a language</option>
                  {SUPPORTED_LANGUAGES.map((l) => (
                    <option key={l} value={l}>
                      {l.charAt(0).toUpperCase() + l.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="repoUrl" className="text-sm font-medium">
                Repository URL
              </label>
              <input
                id="repoUrl"
                name="repoUrl"
                type="url"
                placeholder="https://github.com/your-org/your-repo"
                className="mt-1.5 w-full rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                {loading ? 'Creating...' : 'Create Project'}
              </button>
              <Link
                href="/dashboard/projects"
                className="inline-flex items-center rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
              >
                Cancel
              </Link>
            </div>
          </form>
        </div>
      ) : (
        <div className="rounded-xl border bg-card p-6 shadow-sm space-y-5">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Code2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold">Paste your contract code</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Paste your Solidity or other smart contract code to create a project and start
                scanning immediately.
              </p>
            </div>
          </div>

          <textarea
            placeholder={`// SPDX-License-Identifier: MIT\npragma solidity ^0.8.19;\n\ncontract Example {\n  // Paste your contract here...\n}`}
            rows={14}
            className="w-full rounded-lg border bg-background px-4 py-3 font-mono text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />

          <div className="flex gap-3">
            <button
              onClick={() => {
                toast.info('Contract pasted! Switch to the details tab to name your project.');
                setTab('form');
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Upload className="h-4 w-4" />
              Continue to Details
            </button>
            <Link
              href="/dashboard/projects"
              className="inline-flex items-center rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
            >
              Cancel
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
