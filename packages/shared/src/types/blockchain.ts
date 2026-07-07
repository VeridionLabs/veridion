export interface BlockchainTransaction {
  hash: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  timestamp: Date | null;
  error: string | null;
}

export interface AuditRegistryEntry {
  auditId: string;
  projectId: string;
  projectName: string;
  contractHash: string;
  reportHash: string;
  securityScore: number;
  timestamp: number;
  version: string;
  auditorWallet: string;
  status: 'VERIFIED' | 'PENDING';
}

export interface ProjectRegistryEntry {
  projectId: string;
  projectName: string;
  ownerWallet: string;
  createdAt: number;
  updatedAt: number;
  status: 'ACTIVE' | 'ARCHIVED';
}

export interface VerificationRequest {
  auditId: string;
  reportHash: string;
  securityScore: number;
  walletAddress: string;
}
