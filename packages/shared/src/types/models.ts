import type { AuditStatus, FindingSeverity } from '../enums';

export interface User {
  id: string;
  email: string;
  displayName: string | null;
  walletAddress: string | null;
  avatarUrl: string | null;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

export type UserRole = 'USER' | 'ADMIN' | 'AUDITOR';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  members: OrganizationMember[];
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationMember {
  id: string;
  userId: string;
  organizationId: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
  joinedAt: Date;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  repoUrl: string | null;
  chain: string;
  language: string;
  userId: string;
  organizationId: string | null;
  contractCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Audit {
  id: string;
  projectId: string;
  status: AuditStatus;
  commitHash: string | null;
  securityScore: number | null;
  reportHash: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuditFinding {
  id: string;
  auditId: string;
  pluginId: string;
  title: string;
  description: string;
  severity: FindingSeverity;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  codeSnippet: string | null;
  recommendation: string | null;
  aiSummary: string | null;
  status: 'OPEN' | 'ACKNOWLEDGED' | 'FALSE_POSITIVE' | 'RESOLVED';
  createdAt: Date;
  updatedAt: Date;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
  read: boolean;
  link: string | null;
  createdAt: Date;
}
