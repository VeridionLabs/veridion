'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { User } from '@veridion/sdk';
import { CheckCircle2, Copy, ExternalLink, Loader2, Wallet } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';

// Stellar public key regex pattern (ed25519 seed)
// Stellar uses base32 encoding: A-Z (excluding 0,1,8,9) and digits 2-7
const STELLAR_ADDRESS_REGEX = /^G[A-Z2-7]{55}$/;

async function fetchProfile(): Promise<User> {
  const res = await fetch('/api/users/me', {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch profile');
  return res.json() as Promise<User>;
}

async function updateWallet(walletAddress: string): Promise<User> {
  const res = await fetch('/api/users/me', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ walletAddress: walletAddress || null }),
  });
  if (!res.ok) throw new Error('Failed to update wallet address');
  return res.json() as Promise<User>;
}

function validateStellarAddress(address: string): string | null {
  if (!address) return null;
  const trimmed = address.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith('G')) return 'Stellar address must start with G';
  if (trimmed.length !== 56) return 'Stellar address must be exactly 56 characters';
  if (!STELLAR_ADDRESS_REGEX.test(trimmed)) return 'Invalid Stellar address format';
  return null;
}

export function WalletSection() {
  const queryClient = useQueryClient();
  const [addressInput, setAddressInput] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const { data: profile, isLoading } = useQuery<User>({
    queryKey: ['profile'],
    queryFn: fetchProfile,
  });

  const mutation = useMutation({
    mutationFn: updateWallet,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast.success('Wallet address updated successfully');
      setIsEditing(false);
      setValidationError(null);
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to update wallet address');
    },
  });

  const walletAddress = profile?.walletAddress ?? null;

  const handleSave = () => {
    const trimmed = addressInput.trim();
    const error = validateStellarAddress(trimmed);
    if (trimmed && error) {
      setValidationError(error);
      return;
    }
    setValidationError(null);
    mutation.mutate(trimmed);
  };

  const handleEdit = () => {
    setAddressInput(walletAddress ?? '');
    setIsEditing(true);
    setValidationError(null);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setAddressInput('');
    setValidationError(null);
  };

  const handleCopy = () => {
    if (walletAddress) {
      void navigator.clipboard.writeText(walletAddress);
      toast.success('Wallet address copied to clipboard');
    }
  };

  if (isLoading) {
    return (
      <div className="bg-card rounded-xl border p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border p-6">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-lg">
            <Wallet className="text-primary h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Wallet Address</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Connect your Stellar wallet to verify audits on-chain.
            </p>
          </div>
        </div>
        {walletAddress && !isEditing && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-500">
            <CheckCircle2 className="h-3 w-3" />
            Connected
          </span>
        )}
      </div>

      {isEditing ? (
        <div className="mt-5 space-y-4">
          <div>
            <label htmlFor="walletAddress" className="text-sm font-medium">
              Stellar Public Key
            </label>
            <input
              id="walletAddress"
              type="text"
              value={addressInput}
              onChange={(e) => {
                setAddressInput(e.target.value);
                setValidationError(null);
              }}
              placeholder="G..."
              maxLength={56}
              autoFocus
              className={cn(
                'bg-background placeholder:text-muted-foreground focus:ring-ring mt-1.5 w-full rounded-lg border px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2',
                validationError && 'border-destructive focus:ring-destructive',
              )}
            />
            {validationError && <p className="text-destructive mt-1 text-xs">{validationError}</p>}
            <p className="text-muted-foreground mt-1 text-xs">
              Enter your Stellar public key (starts with G, 56 characters).
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={mutation.isPending}
              className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Save Address
                </>
              )}
            </button>
            <button
              onClick={handleCancel}
              disabled={mutation.isPending}
              className="hover:bg-muted inline-flex items-center rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-5">
          {walletAddress ? (
            <div className="space-y-4">
              <div className="bg-background flex items-center justify-between rounded-lg border p-3">
                <code className="font-mono text-sm">{walletAddress}</code>
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleCopy}
                    className="text-muted-foreground hover:text-foreground rounded-md p-1.5 transition-colors"
                    title="Copy address"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                  <a
                    href={`https://stellar.expert/explorer/public/account/${walletAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground rounded-md p-1.5 transition-colors"
                    title="View on Stellar Expert"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              </div>
              <button
                onClick={handleEdit}
                className="text-primary text-sm font-medium hover:underline"
              >
                Change wallet address
              </button>
            </div>
          ) : (
            <div className="mt-4">
              <button
                onClick={handleEdit}
                className="hover:bg-muted inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
              >
                <Wallet className="h-4 w-4" />
                Connect Stellar Wallet
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
