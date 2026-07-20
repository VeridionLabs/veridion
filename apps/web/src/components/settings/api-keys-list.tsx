'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Key, Loader2, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

interface ApiKey {
  id: string;
  name: string;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

interface CreateApiKeyResponse extends ApiKey {
  key: string;
}

async function fetchApiKeys(): Promise<ApiKey[]> {
  const res = await fetch('/api/api-keys', {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch API keys');
  return res.json() as Promise<ApiKey[]>;
}

async function createApiKey(name: string): Promise<CreateApiKeyResponse> {
  const res = await fetch('/api/api-keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error('Failed to create API key');
  return res.json() as Promise<CreateApiKeyResponse>;
}

async function revokeApiKey(keyId: string): Promise<void> {
  const res = await fetch(`/api/api-keys/${keyId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to revoke API key');
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}

export function ApiKeysList() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const revokeMutation = useMutation({
    mutationFn: revokeApiKey,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      toast.success('API key revoked successfully');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to revoke API key');
    },
  });

  // Track which key is being revoked for per-button loading state
  const revokingId =
    revokeMutation.isPending && typeof revokeMutation.variables === 'string'
      ? revokeMutation.variables
      : null;

  const {
    data: apiKeys,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<ApiKey[]>({
    queryKey: ['api-keys'],
    queryFn: fetchApiKeys,
  });

  const createMutation = useMutation({
    mutationFn: createApiKey,
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      setCreatedKey(data.key);
      setShowCreate(false);
      setNewKeyName('');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to create API key');
    },
  });

  const handleCreate = () => {
    if (!newKeyName.trim()) {
      toast.error('Please enter a name for the API key');
      return;
    }
    createMutation.mutate(newKeyName.trim());
  };

  const handleCopyKey = (key: string) => {
    void navigator.clipboard.writeText(key);
    toast.success('API key copied to clipboard');
  };

  const handleDismissNewKey = () => {
    setCreatedKey(null);
  };

  return (
    <div className="bg-card rounded-xl border p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">API Keys</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage API keys for programmatic access to Veridion.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Key
        </button>
      </div>

      {/* Created key banner */}
      {createdKey && (
        <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                API Key Created
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                Copy this key now. You won&apos;t be able to see it again.
              </p>
              <div className="bg-background mt-2 flex items-center justify-between rounded-lg border p-2.5">
                <code className="break-all font-mono text-xs">{createdKey}</code>
                <button
                  onClick={() => handleCopyKey(createdKey)}
                  className="text-muted-foreground hover:text-foreground ml-2 shrink-0 rounded-md p-1.5 transition-colors"
                  title="Copy key"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>
            <button
              onClick={handleDismissNewKey}
              className="text-muted-foreground hover:text-foreground ml-3 rounded-md p-1 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="mt-4 rounded-lg border p-4">
          <label htmlFor="newKeyName" className="text-sm font-medium">
            Key Name
          </label>
          <div className="mt-1.5 flex items-center gap-2">
            <input
              id="newKeyName"
              type="text"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="e.g., Production API Key"
              maxLength={100}
              autoFocus
              className="bg-background placeholder:text-muted-foreground focus:ring-ring flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleCreate();
                }
                if (e.key === 'Escape') {
                  setShowCreate(false);
                  setNewKeyName('');
                }
              }}
            />
            <button
              onClick={handleCreate}
              disabled={createMutation.isPending}
              className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Generate'}
            </button>
            <button
              onClick={() => {
                setShowCreate(false);
                setNewKeyName('');
              }}
              disabled={createMutation.isPending}
              className="hover:bg-muted inline-flex items-center rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Keys list */}
      <div className="mt-5">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Key className="text-muted-foreground/30 h-10 w-10" />
            <p className="text-muted-foreground mt-3 text-sm">Failed to load API keys</p>
            <p className="text-muted-foreground text-xs">{error?.message}</p>
            <button
              onClick={() => {
                void refetch();
              }}
              className="text-primary mt-3 inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Try again
            </button>
          </div>
        ) : apiKeys && apiKeys.length > 0 ? (
          <div className="divide-y">
            {apiKeys.map((key) => (
              <div
                key={key.id}
                className="hover:bg-muted/50 flex items-center justify-between px-1 py-3 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="bg-primary/10 flex h-9 w-9 items-center justify-center rounded-lg">
                    <Key className="text-primary h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{key.name}</p>
                    <p className="text-muted-foreground text-xs">
                      Created {formatDate(key.createdAt)}
                      {key.lastUsedAt
                        ? ` · Last used ${formatDate(key.lastUsedAt)}`
                        : ' · Never used'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (window.confirm(`Revoke "${key.name}"? This action cannot be undone.`)) {
                      revokeMutation.mutate(key.id);
                    }
                  }}
                  disabled={revokeMutation.isPending && revokingId === key.id}
                  className="text-muted-foreground hover:text-destructive rounded-md p-2 transition-colors disabled:opacity-50"
                  title="Revoke key"
                >
                  {revokingId === key.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Key className="text-muted-foreground/30 h-10 w-10" />
            <p className="text-muted-foreground mt-3 text-sm font-medium">No API keys yet</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Create an API key to get started with programmatic access.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
