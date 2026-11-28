import type { WorkspaceLoadProfile } from "@/lib/erp/workspace-repository";
import { canOpenSettings, type Permission } from "@/lib/security/permissions";

export const workspaceProfilePermissions = {
  full: "business:read",
  shell: null,
  dashboard: "business:read",
  sales: "accounting:write",
  purchases: "accounting:write",
  cash: "accounting:write",
  inventory: "inventory:manage",
  pricing: "inventory:manage",
  accounting: "accounting:read",
  reports: "reports:export",
  tax: "tax:prepare",
  hr: "hr:manage",
  payroll: "payroll:run",
  assets: "accounting:read",
  settings: "business:read",
  onboarding: "business:update",
  pos: "pos:read",
  "document-detail": "accounting:read",
} as const satisfies Record<WorkspaceLoadProfile, Permission | null>;

export type PublicWorkspaceLoadProfile = Exclude<WorkspaceLoadProfile, "full" | "document-detail">;

export const publicWorkspaceProfiles = [
  "shell",
  "dashboard",
  "sales",
  "purchases",
  "cash",
  "inventory",
  "pricing",
  "accounting",
  "reports",
  "tax",
  "hr",
  "payroll",
  "assets",
  "settings",
  "onboarding",
  "pos",
] as const satisfies readonly PublicWorkspaceLoadProfile[];

const publicWorkspaceProfileSet = new Set<string>(publicWorkspaceProfiles);

export function requiredPermissionForWorkspaceProfile(profile: WorkspaceLoadProfile): Permission | null {
  return workspaceProfilePermissions[profile];
}

export function canOpenWorkspaceProfile(profile: WorkspaceLoadProfile, permissions: readonly Permission[]) {
  if (profile === "settings") return canOpenSettings(permissions);
  const permission = requiredPermissionForWorkspaceProfile(profile);
  return permission === null || permissions.includes(permission);
}

export function parsePublicWorkspaceProfile(value: string | null): PublicWorkspaceLoadProfile | null {
  return value && publicWorkspaceProfileSet.has(value) ? (value as PublicWorkspaceLoadProfile) : null;
}
