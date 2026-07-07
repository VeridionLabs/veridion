import { type Permission, ROLE_PERMISSIONS } from './types';

export class RbacService {
  hasPermission(role: string, permission: Permission): boolean {
    const permissions = ROLE_PERMISSIONS[role];
    if (!permissions) return false;
    return permissions.includes(permission);
  }

  hasAllPermissions(role: string, permissions: Permission[]): boolean {
    return permissions.every((p) => this.hasPermission(role, p));
  }

  hasAnyPermission(role: string, permissions: Permission[]): boolean {
    return permissions.some((p) => this.hasPermission(role, p));
  }

  getPermissions(role: string): Permission[] {
    return ROLE_PERMISSIONS[role] ?? [];
  }
}
