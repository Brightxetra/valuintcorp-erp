import { describe, expect, it } from "vitest";
import {
  hashSessionToken,
  isIdleSessionExpired,
  parseCookieHeader,
  rememberCookieValue,
} from "@/lib/auth/session-policy";

describe("session policy", () => {
  it("expires non-remembered sessions after the idle window", () => {
    expect(isIdleSessionExpired(1_000, false, 1_000 + 30 * 60 + 1)).toBe(true);
    expect(isIdleSessionExpired(1_000, false, 1_000 + 60)).toBe(false);
    expect(isIdleSessionExpired(1_000, true, 1_000 + 60 * 60 * 24)).toBe(false);
  });

  it("parses malformed cookies without throwing", () => {
    const cookies = parseCookieHeader("a=1; broken=%E0%A4%A; remembered=1");

    expect(cookies.get("a")).toBe("1");
    expect(cookies.get("broken")).toBe("%E0%A4%A");
    expect(cookies.get("remembered")).toBe(rememberCookieValue(true));
  });

  it("hashes session tokens deterministically without exposing the token", async () => {
    const first = await hashSessionToken("session-token");
    const second = await hashSessionToken("session-token");

    expect(first).toBe(second);
    expect(first).not.toContain("session-token");
    expect(first).toHaveLength(64);
  });
});
