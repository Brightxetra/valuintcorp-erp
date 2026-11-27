import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  acceptInvites: vi.fn(),
  adminSignOut: vi.fn(),
  createLoginSession: vi.fn(),
  from: vi.fn(),
  getBinding: vi.fn(),
  getBySupabaseSession: vi.fn(),
  isRecent: vi.fn(),
  revokeByToken: vi.fn(),
  revokeOther: vi.fn(),
  touch: vi.fn(),
  verify: vi.fn(),
}));

vi.mock("@/lib/auth/verified-session", () => ({
  verifySupabaseAccessToken: mocks.verify,
}));

vi.mock("@/lib/auth/token", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/token")>()),
  isRecentSupabaseAuthentication: mocks.isRecent,
}));

vi.mock("@/lib/auth/login-sessions", () => ({
  createLoginSession: mocks.createLoginSession,
  getLoginSessionBinding: mocks.getBinding,
  getLoginSessionBySupabaseSession: mocks.getBySupabaseSession,
  revokeLoginSessionByToken: mocks.revokeByToken,
  revokeOtherLoginSessionsForUser: mocks.revokeOther,
  touchLoginSession: mocks.touch,
}));

vi.mock("@/lib/auth/member-invites", () => ({
  acceptPendingMemberInvitesForUser: mocks.acceptInvites,
}));

vi.mock("@/lib/supabase/service", () => ({
  isSupabaseServiceConfigured: () => true,
  createServiceSupabaseClient: () => ({
    auth: { admin: { signOut: mocks.adminSignOut } },
    from: mocks.from,
  }),
}));

import { POST } from "@/app/api/auth/session/route";

const userId = "11111111-1111-4111-8111-111111111111";
const supabaseSessionId = "22222222-2222-4222-8222-222222222222";

function request(body: Record<string, unknown>, cookie?: string) {
  const headers = new Headers({ "content-type": "application/json" });
  if (cookie) headers.set("cookie", cookie);
  return new Request("http://localhost/api/auth/session", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function verifiedSession(authenticationMethod = "password") {
  return {
    accessToken: "access-token",
    client: {},
    identity: {
      userId,
      sessionId: supabaseSessionId,
      authenticationMethod,
      authenticatedAt: 1_700_000_000,
    },
    user: { id: userId, email: "owner@example.com", user_metadata: {} },
  };
}

describe("session bootstrap binding", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_test");
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");

    for (const mock of Object.values(mocks)) mock.mockReset();

    const membershipQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    membershipQuery.select.mockReturnValue(membershipQuery);
    membershipQuery.eq.mockReturnValue(membershipQuery);
    membershipQuery.order.mockReturnValue(membershipQuery);
    membershipQuery.limit.mockReturnValue(membershipQuery);
    mocks.from.mockReturnValue(membershipQuery);

    mocks.verify.mockResolvedValue(verifiedSession());
    mocks.getBinding.mockResolvedValue({ state: "missing" });
    mocks.getBySupabaseSession.mockResolvedValue({ state: "missing" });
    mocks.isRecent.mockReturnValue(true);
    mocks.createLoginSession.mockResolvedValue({ ok: true, count: 1 });
    mocks.touch.mockResolvedValue(true);
    mocks.revokeOther.mockResolvedValue({ ok: true, count: 2 });
    mocks.adminSignOut.mockResolvedValue({ error: null });
    mocks.acceptInvites.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not let caller-controlled freshLogin revive an old session", async () => {
    mocks.isRecent.mockReturnValue(false);

    const response = await POST(request({ accessToken: "access-token", freshLogin: true }));

    expect(response.status).toBe(401);
    expect(mocks.createLoginSession).not.toHaveBeenCalled();
  });

  it("reuses only an exact active cookie binding", async () => {
    mocks.isRecent.mockReturnValue(false);
    mocks.getBinding.mockResolvedValue({
      state: "active",
      userId,
      supabaseSessionId,
    });

    const response = await POST(
      request(
        { accessToken: "access-token" },
        "valuintcorp.session-id=existing-app-session; valuintcorp.session-remember=1",
      ),
    );

    expect(response.status).toBe(200);
    expect(mocks.touch).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionToken: "existing-app-session",
        userId,
        supabaseSessionId,
      }),
    );
    expect(mocks.createLoginSession).not.toHaveBeenCalled();
  });

  it("cannot register a second app session for an already known Supabase session", async () => {
    mocks.getBySupabaseSession.mockResolvedValue({
      state: "revoked",
      userId,
      supabaseSessionId,
    });

    const response = await POST(request({ accessToken: "access-token" }));

    expect(response.status).toBe(401);
    expect(mocks.createLoginSession).not.toHaveBeenCalled();
  });

  it("fails closed when recovery cannot revoke other Supabase sessions", async () => {
    mocks.verify.mockResolvedValue(verifiedSession("recovery"));
    mocks.adminSignOut.mockResolvedValue({ error: new Error("auth unavailable") });

    const response = await POST(request({ accessToken: "access-token" }));

    expect(response.status).toBe(503);
    expect(mocks.revokeOther).not.toHaveBeenCalled();
    expect(mocks.createLoginSession).not.toHaveBeenCalled();
  });

  it("revokes both auth and app sessions before completing recovery bootstrap", async () => {
    mocks.verify.mockResolvedValue(verifiedSession("recovery"));

    const response = await POST(request({ accessToken: "access-token" }));

    expect(response.status).toBe(200);
    expect(mocks.adminSignOut).toHaveBeenCalledWith("access-token", "others");
    expect(mocks.revokeOther).toHaveBeenCalledWith(userId, null, "password_recovery");
    expect(mocks.createLoginSession).toHaveBeenCalledWith(
      expect.objectContaining({ userId, supabaseSessionId }),
    );
    expect(mocks.adminSignOut.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.createLoginSession.mock.invocationCallOrder[0],
    );
    expect(mocks.revokeOther.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.createLoginSession.mock.invocationCallOrder[0],
    );
  });
});
