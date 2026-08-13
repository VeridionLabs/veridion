import { z } from 'zod';

// ---- Auth Schemas ----
export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  displayName: z.string().min(2, 'Display name must be at least 2 characters').max(50),
});

// ---- Project Schemas ----
export const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(100),
  description: z.string().max(500).optional(),
  repoUrl: z.string().url('Invalid repository URL').optional().or(z.literal('')),
  chain: z.string().min(1, 'Chain is required'),
  language: z.string().min(1, 'Language is required'),
  organizationId: z.string().uuid().optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  repoUrl: z.string().url().optional().or(z.literal('')),
});

// ---- Audit Schemas ----
export const createAuditSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
  commitHash: z.string().optional(),
  sourceCode: z.string().optional(),
  contractPath: z.string().optional(),
  plugins: z.array(z.string()).optional(),
});

// ---- Finding Update Schema ----
export const updateFindingSchema = z.object({
  status: z.enum(['OPEN', 'ACKNOWLEDGED', 'FALSE_POSITIVE', 'RESOLVED']).optional(),
  aiSummary: z.string().optional(),
});

// ---- Report Schemas ----
export const generateReportSchema = z.object({
  auditId: z.string().uuid('Invalid audit ID'),
  format: z.enum(['PDF', 'MARKDOWN', 'HTML', 'JSON']),
  includeAiSummary: z.boolean().default(true),
});

// ---- Pagination Schema ----
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// ---- AI Chat Schema ----
export const aiChatSchema = z.object({
  auditId: z.string().uuid('Invalid audit ID'),
  message: z.string().min(1, 'Message is required').max(4000),
  context: z
    .object({
      findingId: z.string().uuid().optional(),
      codeSnippet: z.string().optional(),
    })
    .optional(),
});

// ---- Blockchain Verification Schema ----
export const blockchainVerificationSchema = z.object({
  auditId: z.string().uuid('Invalid audit ID'),
  walletAddress: z.string().min(1, 'Wallet address is required'),
});

export type LoginDto = z.infer<typeof loginSchema>;
export type RegisterDto = z.infer<typeof registerSchema>;
export type CreateProjectDto = z.infer<typeof createProjectSchema>;
export type UpdateProjectDto = z.infer<typeof updateProjectSchema>;
export type CreateAuditDto = z.infer<typeof createAuditSchema>;
export type UpdateFindingDto = z.infer<typeof updateFindingSchema>;
export type GenerateReportDto = z.infer<typeof generateReportSchema>;
export type PaginationDto = z.infer<typeof paginationSchema>;
export type AiChatDto = z.infer<typeof aiChatSchema>;
export type BlockchainVerificationDto = z.infer<typeof blockchainVerificationSchema>;
