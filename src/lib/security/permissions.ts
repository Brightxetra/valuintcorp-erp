import type { BusinessRole } from "@/lib/domain/types";

export type Permission =
  | "business:read"
  | "business:update"
  | "accounting:read"
  | "accounting:write"
  | "reports:export"
  | "inventory:manage"
  | "hr:manage"
  | "payroll:run"
  | "tax:prepare"
  | "admin:manage_users";

const permissionsByRole: Record<BusinessRole, Permission[]> = {
  owner: [
    "business:read",
    "business:update",
    "accounting:read",
    "accounting:write",
    "reports:export",
    "inventory:manage",
    "hr:manage",
    "payroll:run",
    "tax:prepare",
    "admin:manage_users",
  ],
  finance_admin: [
    "business:read",
    "accounting:read",
    "accounting:write",
    "reports:export",
    "inventory:manage",
    "tax:prepare",
  ],
  staff: ["business:read", "accounting:write", "inventory:manage"],
  hr: ["business:read", "hr:manage", "payroll:run", "reports:export"],
  external_advisor: ["business:read", "accounting:read", "reports:export", "tax:prepare"],
  system_admin: [
    "business:read",
    "business:update",
    "accounting:read",
    "accounting:write",
    "reports:export",
    "inventory:manage",
    "hr:manage",
    "payroll:run",
    "tax:prepare",
    "admin:manage_users",
  ],
};

export function can(role: BusinessRole, permission: Permission): boolean {
  return permissionsByRole[role].includes(permission);
}

export function permissionsForRole(role: BusinessRole): Permission[] {
  return [...permissionsByRole[role]];
}

export function assertCan(role: BusinessRole, permission: Permission): void {
  if (!can(role, permission)) {
    throw new Error(`${role} is not allowed to perform ${permission}.`);
  }
}
