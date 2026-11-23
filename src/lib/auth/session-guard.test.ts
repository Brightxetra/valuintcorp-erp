import { beforeEach, describe, expect, it, vi } from "vitest";

const { getLoginSessionBindingMock } = vi.hoisted(() => ({
  getLoginSessionBindingMock: vi.fn(),
}));

vi.mock("@/lib/auth/login-sessions", () => ({
  getLoginSessionBinding: getLoginSessionBindingMock,
}));

import { validateRequestSession } from "@/lib/auth/session-guard";
import type { VerifiedSupabaseSessionIdentity } from "@/lib/auth/token";

const identity: VerifiedSupabaseSessionIdentity = {
  userId: "11111111-1111-4111-8111-111111111111",
  sessionId: "22222222-2222-4222-8222-222222222222",
  authenticationMethod: "password",
  authenticatedAt: 1_700_000_000,
};

function requestWithSession(token = "app-session") {
  return new Request("http://localhost/dashboard", {
    headers: { cookie: `valuintcorp.session-id=${token}; valuintcorp.session-remember=1` },
  });
}

describe("request session binding", () => {
  beforeEach(() => {
    getLoginSessionBindingMock.mockReset();
  });

  it("requires an application session cookie", async () => {
    const result = await validateRequestSession(new Request("http://localhost/dashboard"), identity);

    expect(result.ok).toBe(false);
    expect(getLoginSessionBindingMock).not.toHaveBeenCalled();
  });

  it.each(["missing", "unavailable", "invalid", "expired"] as const)(
    "fails closed when the registry state is %s",
    async (state) => {
      getLoginSessionBindingMock.mockResolvedValue({ state });

      const result = await validateRequestSession(requestWithSession(), identity);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("session-expired");
    },
  );

  it("rejects a revoked application session", async () => {
    getLoginSessionBindingMock.mockResolvedValue({
      state: "revoked",
      userId: identity.userId,
      supabaseSessionId: identity.sessionId,
    });

    const result = await validateRequestSession(requestWithSession(), identity);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("session-revoked");
  });

  it.each([
    ["different user", "33333333-3333-4333-8333-333333333333", identity.sessionId],
    ["different Supabase session", identity.userId, "44444444-4444-4444-8444-444444444444"],
  ])("rejects an active binding for a %s", async (_label, userId, supabaseSessionId) => {
    getLoginSessionBindingMock.mockResolvedValue({ state: "active", userId, supabaseSessionId });

    const result = await validateRequestSession(requestWithSession(), identity);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("session-revoked");
  });

  it("accepts only an exact active user and Supabase session binding", async () => {
    getLoginSessionBindingMock.mockResolvedValue({
      state: "active",
      userId: identity.userId,
      supabaseSessionId: identity.sessionId,
    });

    const result = await validateRequestSession(requestWithSession(), identity);

    expect(result).toMatchObject({
      ok: true,
      sessionToken: "app-session",
      userId: identity.userId,
      supabaseSessionId: identity.sessionId,
    });
  });
});
