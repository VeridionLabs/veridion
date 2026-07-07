export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthConfig {
  jwtSecret: string;
  jwtExpiration: string;
  jwtRefreshSecret: string;
  jwtRefreshExpiration: string;
  bcryptRounds: number;
}

export enum Permission {
  // Projects
  PROJECT_CREATE = 'project:create',
  PROJECT_READ = 'project:read',
  PROJECT_UPDATE = 'project:update',
  PROJECT_DELETE = 'project:delete',

  // Audits
  AUDIT_CREATE = 'audit:create',
  AUDIT_READ = 'audit:read',
  AUDIT_UPDATE = 'audit:update',
  AUDIT_DELETE = 'audit:delete',

  // Findings
  FINDING_CREATE = 'finding:create',
  FINDING_READ = 'finding:read',
  FINDING_UPDATE = 'finding:update',

  // Reports
  REPORT_GENERATE = 'report:generate',
  REPORT_READ = 'report:read',

  // Admin
  ADMIN_ACCESS = 'admin:access',
  USER_MANAGE = 'user:manage',
  ORG_MANAGE = 'org:manage',
  PLUGIN_MANAGE = 'plugin:manage',
}

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  USER: [
    Permission.PROJECT_CREATE,
    Permission.PROJECT_READ,
    Permission.PROJECT_UPDATE,
    Permission.PROJECT_DELETE,
    Permission.AUDIT_CREATE,
    Permission.AUDIT_READ,
    Permission.FINDING_READ,
    Permission.REPORT_GENERATE,
    Permission.REPORT_READ,
  ],
  AUDITOR: [
    Permission.PROJECT_CREATE,
    Permission.PROJECT_READ,
    Permission.PROJECT_UPDATE,
    Permission.PROJECT_DELETE,
    Permission.AUDIT_CREATE,
    Permission.AUDIT_READ,
    Permission.AUDIT_UPDATE,
    Permission.FINDING_CREATE,
    Permission.FINDING_READ,
    Permission.FINDING_UPDATE,
    Permission.REPORT_GENERATE,
    Permission.REPORT_READ,
  ],
  ADMIN: Object.values(Permission),
};
