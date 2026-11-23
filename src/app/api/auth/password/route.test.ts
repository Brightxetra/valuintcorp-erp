import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  revokeOther: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock("@/lib/auth/api", () => ({
  isApiResponse: (value: unknown) => value instanceof Response,
  requireAuthenticatedUser: mocks.requireUser,
}));

vi.mock("@/lib/auth/login-sessions", () => ({
  revokeOtherLoginSessionsForUser: mocks.revokeOther,
}));

vi.mock("@/lib/supabase/config", () => ({
  requireSupabasePublicConfig: () => ({
    url: "https://example.supabase.co",
    anonKey: "sb_publishable_test",
  }),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: mocks.signIn,
      signOut: mocks.signOut,
      updateUser: mocks.updateUser,
    },
  }),
}));

import { POST } from "@/app/api/auth/password/route";

const userId = "11111111-1111-4111-8111-111111111111";

function request() {
  return new Request("http://localhost/api/auth/password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      currentPassword: "current-password",
      newPassword: "new-password",
    }),
  });
}

describe("password change session revocation", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.requireUser.mockResolvedValue({
      demoMode: false,
      userId,
      userEmail: "owner@example.com",
      rememberMe: false,
      sessionToken: "old-app-session",
      supabaseSessionId: "22222222-2222-4222-8222-222222222222",
    });
    mocks.signIn.mockResolvedValue({
      data: {
        user: { id: userId },
        session: {
          access_token: "new-access-token",
          refresh_token: "new-refresh-token",
        },
      },
      error: null,
    });
    mocks.updateUser.mockResolvedValue({ error: null });
    mocks.signOut.mockResolvedValue({ error: null });
    mocks.revokeOther.mockResolvedValue({ ok: true, count: 3 });
  });

  it("fails closed when Supabase cannot revoke other sessions", async () => {
    mocks.signOut.mockResolvedValue({ error: new Error("auth unavailable") });

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(mocks.revokeOther).not.toHaveBeenCalled();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("fails closed when the application registry cannot revoke sessions", async () => {
    mocks.revokeOther.mockResolvedValue({ ok: false, reason: "unavailable" });

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("revokes every old app session and returns only the newly authenticated tokens", async () => {
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "others" });
    expect(mocks.revokeOther).toHaveBeenCalledWith(userId, null, "password_changed");
    expect(body).toMatchObject({
      ok: true,
      revokedOtherSessions: 3,
      session: {
        accessToken: "new-access-token",
        refreshToken: "new-refresh-token",
        userId,
      },
    });
  });
});
