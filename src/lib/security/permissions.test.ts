import { describe, expect, it } from "vitest";
import { assertCan, can } from "@/lib/security/permissions";

describe("role permissions", () => {
  it("allows owner to export reports and manage users", () => {
    expect(can("owner", "reports:export")).toBe(true);
    expect(can("owner", "admin:manage_users")).toBe(true);
  });

  it("keeps staff away from financial exports", () => {
    expect(can("staff", "reports:export")).toBe(false);
    expect(() => assertCan("staff", "reports:export")).toThrow("not allowed");
  });
});
