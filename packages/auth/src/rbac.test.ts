import { describe, expect, it } from 'vitest';

import { RbacService } from './rbac.service';
import { Permission } from './types';

describe('RbacService', () => {
  const rbac = new RbacService();

  it('should grant PROJECT_READ to USER role', () => {
    expect(rbac.hasPermission('USER', Permission.PROJECT_READ)).toBe(true);
  });

  it('should grant all permissions to ADMIN role', () => {
    expect(rbac.hasPermission('ADMIN', Permission.ADMIN_ACCESS)).toBe(true);
    expect(rbac.hasPermission('ADMIN', Permission.USER_MANAGE)).toBe(true);
    expect(rbac.hasPermission('ADMIN', Permission.PROJECT_CREATE)).toBe(true);
  });

  it('should deny ADMIN_ACCESS to USER role', () => {
    expect(rbac.hasPermission('USER', Permission.ADMIN_ACCESS)).toBe(false);
  });

  it('should return all permissions for a role', () => {
    const permissions = rbac.getPermissions('AUDITOR');
    expect(permissions.length).toBeGreaterThan(0);
    expect(permissions).toContain(Permission.AUDIT_CREATE);
  });
});
