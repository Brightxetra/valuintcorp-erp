import { describe, expect, it } from "vitest";
import { assertCan, can, permissionsForMember } from "@/lib/security/permissions";

describe("role permissions", () => {
  it("allows owner to export reports and manage users", () => {
    expect(can("owner", "reports:export")).toBe(true);
    expect(can("owner", "admin:manage_users")).toBe(true);
  });

  it("keeps staff away from financial exports", () => {
    expect(can("staff", "reports:export")).toBe(false);
    expect(() => assertCan("staff", "reports:export")).toThrow("not allowed");
  });

  it("uses a member override instead of broad staff defaults", () => {
    expect(permissionsForMember("staff", "custom", ["pos:sell"])).toEqual(["pos:sell", "pos:read"]);
    expect(permissionsForMember("staff", "custom", ["pos:sell"])).not.toContain("accounting:write");
  });

  it("keeps owner access role-based even when a custom list is sent", () => {
    expect(permissionsForMember("owner", "custom", ["pos:read"])).toContain("admin:manage_users");
  });

  it("retains role defaults without a custom access scope", () => {
    expect(permissionsForMember("hr", "role", [])).toContain("payroll:run");
});
});
