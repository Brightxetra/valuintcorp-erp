import { describe, expect, it } from "vitest";
import { loginSessionStatus } from "@/lib/auth/login-sessions";

describe("login session listing", () => {
  it("keeps active sessions active until their expiry", () => {
    const now = Date.parse("2026-06-22T10:00:00.000Z");

    expect(loginSessionStatus("active", "2026-06-22T10:30:00.000Z", now)).toBe("active");
    expect(loginSessionStatus("active", null, now)).toBe("active");
  });

  it("marks revoked, unknown, and expired rows as inactive", () => {
    const now = Date.parse("2026-06-22T10:00:00.000Z");

    expect(loginSessionStatus("revoked", "2026-06-22T10:30:00.000Z", now)).toBe("revoked");
    expect(loginSessionStatus("expired", "2026-06-22T10:30:00.000Z", now)).toBe("expired");
    expect(loginSessionStatus("legacy", "2026-06-22T10:30:00.000Z", now)).toBe("revoked");
    expect(loginSessionStatus("active", "2026-06-22T09:59:59.000Z", now)).toBe("expired");
  });
});
