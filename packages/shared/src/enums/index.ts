export enum FindingSeverity {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
  GAS = 'GAS',
  INFORMATIONAL = 'INFORMATIONAL',
}

export enum AuditStatus {
  PENDING = 'PENDING',
  SCANNING = 'SCANNING',
  AI_REVIEW = 'AI_REVIEW',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  VERIFIED = 'VERIFIED',
}

export enum UserRole {
  USER = 'USER',
  ADMIN = 'ADMIN',
  AUDITOR = 'AUDITOR',
}

export enum NotificationType {
  INFO = 'INFO',
  SUCCESS = 'SUCCESS',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
}

export enum FindingStatus {
  OPEN = 'OPEN',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  FALSE_POSITIVE = 'FALSE_POSITIVE',
  RESOLVED = 'RESOLVED',
}

export enum ReportFormat {
  PDF = 'PDF',
  MARKDOWN = 'MARKDOWN',
  HTML = 'HTML',
  JSON = 'JSON',
}

export enum BlockchainNetwork {
  STELLAR_MAINNET = 'STELLAR_MAINNET',
  STELLAR_TESTNET = 'STELLAR_TESTNET',
  STELLAR_FUTURENET = 'STELLAR_FUTURENET',
}
