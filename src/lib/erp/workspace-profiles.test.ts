import { describe, expect, test } from "vitest";
import type { WorkspaceLoadProfile } from "@/lib/erp/workspace-repository";
import {
  parsePublicWorkspaceProfile,
  publicWorkspaceProfiles,
  requiredPermissionForWorkspaceProfile,
  workspaceProfilePermissions,
} from "@/lib/erp/workspace-profiles";

describe("workspace profile authorization registry", () => {
  test("assigns every workspace profile one explicit permission", () => {
    const profiles = Object.keys(workspaceProfilePermissions) as WorkspaceLoadProfile[];

    expect(profiles).toHaveLength(18);
    expect(new Set(profiles)).toHaveProperty("size", 18);
    for (const profile of profiles) {
      expect(requiredPermissionForWorkspaceProfile(profile)).toBe(workspaceProfilePermissions[profile]);
    }
  });

  test("keeps privileged profile permissions distinct", () => {
    expect(requiredPermissionForWorkspaceProfile("shell")).toBeNull();
    expect(requiredPermissionForWorkspaceProfile("payroll")).toBe("payroll:run");
    expect(requiredPermissionForWorkspaceProfile("reports")).toBe("reports:export");
    expect(requiredPermissionForWorkspaceProfile("accounting")).toBe("accounting:read");
    expect(requiredPermissionForWorkspaceProfile("tax")).toBe("tax:prepare");
  });

  test("rejects missing, unknown, and broad full profiles at the public boundary", () => {
    expect(parsePublicWorkspaceProfile(null)).toBeNull();
    expect(parsePublicWorkspaceProfile("unknown")).toBeNull();
    expect(parsePublicWorkspaceProfile("full")).toBeNull();
    expect(parsePublicWorkspaceProfile("document-detail")).toBeNull();
  });

  test("accepts every bounded public profile", () => {
    for (const profile of publicWorkspaceProfiles) {
      expect(parsePublicWorkspaceProfile(profile)).toBe(profile);
    }
  });
});
