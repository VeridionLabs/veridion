import { AlertCircle, CheckCircle, Clock, Shield, XCircle } from 'lucide-react';
import { notFound } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface VerificationData {
  txHash: string;
  auditId: string;
  contractAddress: string;
  status: 'VERIFIED' | 'PENDING' | 'FLAGGED' | 'REVOKED';
  securityScore: number;
  verifiedAt: string;
  signatures: string[];
  badgeLevel: string;
  auditSignatures: Array<{
    auditor: string;
    timestamp: string;
  }>;
}

function getVerificationData(txHash: string): VerificationData | null {
  // In production, this would fetch from the blockchain or API
  // For now, return mock data
  if (txHash.length < 10) return null;

  return {
    txHash,
    auditId: 'audit-123',
    contractAddress: 'GABC...XYZ',
    status: 'VERIFIED',
    securityScore: 92,
    verifiedAt: new Date().toISOString(),
    signatures: ['0x123...', '0x456...', '0x789...'],
    badgeLevel: 'GOLD',
    auditSignatures: [
      { auditor: '0x123...', timestamp: new Date().toISOString() },
      { auditor: '0x456...', timestamp: new Date().toISOString() },
      { auditor: '0x789...', timestamp: new Date().toISOString() },
    ],
  };
}

export default function VerificationExplorerPage({ params }: { params: { txHash: string } }) {
  const verification = getVerificationData(params.txHash);

  if (!verification) {
    notFound();
  }

  const statusConfig = {
    VERIFIED: {
      icon: CheckCircle,
      color: 'text-green-500',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
    },
    PENDING: {
      icon: Clock,
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-50',
      borderColor: 'border-yellow-200',
    },
    FLAGGED: {
      icon: AlertCircle,
      color: 'text-orange-500',
      bgColor: 'bg-orange-50',
      borderColor: 'border-orange-200',
    },
    REVOKED: {
      icon: XCircle,
      color: 'text-red-500',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
    },
  };

  const StatusIcon = statusConfig[verification.status].icon;
  const statusStyle = statusConfig[verification.status];

  const badgeColors = {
    GOLD: 'from-yellow-400 to-yellow-600',
    SILVER: 'from-gray-300 to-gray-500',
    BRONZE: 'from-orange-400 to-orange-600',
    NONE: 'from-gray-400 to-gray-600',
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 px-4 py-12 dark:from-slate-900 dark:to-slate-800">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <div className="space-y-4 text-center">
          <div className="flex justify-center">
            <Shield className="text-primary h-16 w-16" />
          </div>
          <h1 className="text-4xl font-bold">Verification Explorer</h1>
          <p className="text-muted-foreground">View on-chain audit verification details</p>
        </div>

        {/* Status Card */}
        <Card className={`${statusStyle.bgColor} ${statusStyle.borderColor} border-2`}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <StatusIcon className={`h-6 w-6 ${statusStyle.color}`} />
                Verification Status
              </CardTitle>
              <Badge variant="outline" className={statusStyle.color}>
                {verification.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-muted-foreground text-sm font-medium">Transaction Hash</p>
                <p className="font-mono text-sm">{verification.txHash}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm font-medium">Audit ID</p>
                <p className="font-mono text-sm">{verification.auditId}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm font-medium">Contract Address</p>
                <p className="font-mono text-sm">{verification.contractAddress}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm font-medium">Verified At</p>
                <p className="text-sm">{new Date(verification.verifiedAt).toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Security Score Card */}
        <Card>
          <CardHeader>
            <CardTitle>Security Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="text-5xl font-bold">{verification.securityScore}</div>
              <div className="flex-1">
                <div className="h-4 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full bg-gradient-to-r from-green-400 to-green-600 transition-all duration-500"
                    style={{ width: `${verification.securityScore}%` }}
                  />
                </div>
                <p className="text-muted-foreground mt-2 text-sm">
                  {verification.securityScore >= 90
                    ? 'Excellent security posture'
                    : verification.securityScore >= 75
                      ? 'Good security posture'
                      : verification.securityScore >= 60
                        ? 'Moderate security posture'
                        : 'Needs improvement'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Badge Card */}
        <Card>
          <CardHeader>
            <CardTitle>Security Badge</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div
                className={`h-20 w-20 rounded-full bg-gradient-to-br ${badgeColors[verification.badgeLevel as keyof typeof badgeColors]} flex items-center justify-center text-xl font-bold text-white shadow-lg`}
              >
                {verification.badgeLevel[0]}
              </div>
              <div>
                <p className="text-2xl font-bold">{verification.badgeLevel} Badge</p>
                <p className="text-muted-foreground text-sm">Issued by Veridion Audit Network</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Signatures Card */}
        <Card>
          <CardHeader>
            <CardTitle>Auditor Signatures</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {verification.auditSignatures.map((sig, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between rounded-lg bg-slate-50 p-3 dark:bg-slate-800"
                >
                  <div className="flex items-center gap-3">
                    <div className="bg-primary/10 flex h-8 w-8 items-center justify-center rounded-full">
                      <CheckCircle className="text-primary h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-mono text-sm">{sig.auditor}</p>
                      <p className="text-muted-foreground text-xs">
                        {new Date(sig.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <Badge variant="secondary">Signature #{index + 1}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Blockchain Proof */}
        <Card>
          <CardHeader>
            <CardTitle>Blockchain Proof</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground text-sm">Network</span>
                <span className="text-sm font-medium">Stellar Mainnet</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground text-sm">Protocol</span>
                <span className="text-sm font-medium">Soroban</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground text-sm">Contract</span>
                <span className="font-mono text-sm">Veridion Verifier</span>
              </div>
              <div className="pt-4">
                <a
                  href={`https://stellar.expert/tx/${verification.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary text-sm hover:underline"
                >
                  View on Stellar Expert →
                </a>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-muted-foreground text-center text-sm">
          <p>Powered by Veridion • Smart Contract Security Platform</p>
          <p className="mt-1">
            <a href="/" className="text-primary hover:underline">
              Return to Home
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
