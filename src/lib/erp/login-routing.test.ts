import { describe, expect, it } from "vitest";
import { destinationAfterLogin, sanitizeLoginNextPath } from "@/lib/erp/login-routing";

describe("login routing", () => {
  it("falls back when next path is missing or unsafe", () => {
    expect(sanitizeLoginNextPath(null)).toBe("/dashboard");
    expect(sanitizeLoginNextPath("https://example.com")).toBe("/dashboard");
    expect(sanitizeLoginNextPath("//example.com")).toBe("/dashboard");
    expect(sanitizeLoginNextPath("/login?next=/dashboard")).toBe("/dashboard");
  });

  it.each([
    "/\\evil.example",
    "/\\\\evil.example/path",
    "/%5Cevil.example",
    "/%5cevil.example",
    "/%2Fevil.example",
    "/%2fevil.example",
    "///evil.example",
    "/\u0000evil.example",
    "/\nevil.example",
  ])("rejects ambiguous network-path input %j", (candidate) => {
    expect(sanitizeLoginNextPath(candidate)).toBe("/dashboard");
  });

  it("rejects the decoded mixed-slash exploit from the login query", () => {
    const decoded = decodeURIComponent("%2F%5Cevil.example");

    expect(decoded).toBe("/\\evil.example");
    expect(sanitizeLoginNextPath(decoded)).toBe("/dashboard");
  });

  it("keeps safe internal destinations", () => {
    expect(sanitizeLoginNextPath("/transaksi/invoice?action=new")).toBe("/transaksi/invoice?action=new");
    expect(sanitizeLoginNextPath("/reports?period=2026-08#summary")).toBe(
      "/reports?period=2026-08#summary",
    );
  });

  it("returns only a canonical same-origin path", () => {
    const destination = sanitizeLoginNextPath("/produk/../dashboard?tab=one#top");
    const resolved = new URL(destination, "https://erp.valuintcorp.test");

    expect(destination).toBe("/dashboard?tab=one#top");
    expect(resolved.origin).toBe("https://erp.valuintcorp.test");
  });

  it("sends users with a business away from stale onboarding redirects", () => {
    expect(destinationAfterLogin("/onboarding", true)).toBe("/dashboard");
    expect(destinationAfterLogin("/onboarding?step=business", true)).toBe("/dashboard");
  });

  it("uses the authenticated default path when next path is missing or unsafe", () => {
    expect(destinationAfterLogin(null, true, "/pos")).toBe("/pos");
    expect(destinationAfterLogin("https://example.com", true, "/pos")).toBe("/pos");
    expect(destinationAfterLogin("/login?next=/dashboard", true, "/pos")).toBe("/pos");
    expect(destinationAfterLogin("/onboarding", true, "/pos")).toBe("/pos");
  });

  it("keeps safe child destinations under the authenticated default path", () => {
    expect(destinationAfterLogin("/pos/laporan", true, "/pos")).toBe("/pos/laporan");
  });

  it("does not send POS-only users to ERP routes from stale next paths", () => {
    expect(destinationAfterLogin("/dashboard", true, "/pos")).toBe("/pos");
    expect(destinationAfterLogin("/access-denied", true, "/pos")).toBe("/pos");
  });

  it("sends users without a business to onboarding", () => {
    expect(destinationAfterLogin("/dashboard", false)).toBe("/onboarding");
  });
});
