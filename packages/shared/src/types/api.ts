import type { AuditFinding } from './models';
import type { AuditStatus } from '../enums';

// ---- Pagination ----
export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

// ---- API Response wrapper ----
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  errors?: ApiError[];
}

export interface ApiError {
  field?: string;
  message: string;
  code: string;
}

// ---- Auth ----
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  displayName: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    displayName: string | null;
    role: string;
  };
}

// ---- Projects ----
export interface CreateProjectRequest {
  name: string;
  description?: string;
  repoUrl?: string;
  chain: string;
  language: string;
  organizationId?: string;
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
  repoUrl?: string;
}

// ---- Audits ----
export interface CreateAuditRequest {
  projectId: string;
  commitHash?: string;
  sourceCode?: string;
  contractPath?: string;
  plugins?: string[];
}

export interface AuditFilterParams extends PaginationParams {
  status?: AuditStatus;
  projectId?: string;
  search?: string;
}

// ---- Findings ----
export interface UpdateFindingRequest {
  status?: 'OPEN' | 'ACKNOWLEDGED' | 'FALSE_POSITIVE' | 'RESOLVED';
  aiSummary?: string;
}

// ---- Reports ----
export interface GenerateReportRequest {
  auditId: string;
  format: 'PDF' | 'MARKDOWN' | 'HTML' | 'JSON';
  includeAiSummary: boolean;
}

export interface BlockchainVerificationRequest {
  auditId: string;
  walletAddress: string;
}

// ---- AI ----
export interface AiChatRequest {
  auditId: string;
  message: string;
  context?: {
    findingId?: string;
    codeSnippet?: string;
  };
}

export interface AiChatResponse {
  message: string;
  citations?: {
    findingId?: string;
    lineStart?: number;
    lineEnd?: number;
  }[];
}
