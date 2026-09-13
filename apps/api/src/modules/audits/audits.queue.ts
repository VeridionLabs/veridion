export const AUDIT_QUEUE_NAME = 'audit-scan';

export interface ScanAuditJobData {
  auditId: string;
  projectId: string;
  sourceCode?: string;
  contractPath?: string;
}
