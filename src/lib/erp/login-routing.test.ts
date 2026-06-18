import { describe, expect, it } from "vitest";
import { destinationAfterLogin, sanitizeLoginNextPath } from "@/lib/erp/login-routing";

describe("login routing", () => {
  it("falls back when next path is missing or unsafe", () => {
    expect(sanitizeLoginNextPath(null)).toBe("/dashboard");
    expect(sanitizeLoginNextPath("https://example.com")).toBe("/dashboard");
    expect(sanitizeLoginNextPath("//example.com")).toBe("/dashboard");
    expect(sanitizeLoginNextPath("/login?next=/dashboard")).toBe("/dashboard");
  });

  it("keeps safe internal destinations", () => {
    expect(sanitizeLoginNextPath("/transaksi/invoice?action=new")).toBe("/transaksi/invoice?action=new");
  });

  it("sends users with a business away from stale onboarding redirects", () => {
    expect(destinationAfterLogin("/onboarding", true)).toBe("/dashboard");
    expect(destinationAfterLogin("/onboarding?step=business", true)).toBe("/dashboard");
  });

  it("sends users without a business to onboarding", () => {
    expect(destinationAfterLogin("/dashboard", false)).toBe("/onboarding");
  });
});
