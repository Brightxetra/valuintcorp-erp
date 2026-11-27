import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  acceptPendingMemberInvitesForUserMock,
  findAuthUserByEmailMock,
  fromMock,
  loadSupabaseWorkspaceMock,
  requireApiPermissionMock,
} = vi.hoisted(() => ({
  acceptPendingMemberInvitesForUserMock: vi.fn(),
  findAuthUserByEmailMock: vi.fn(),
  fromMock: vi.fn(),
  loadSupabaseWorkspaceMock: vi.fn(),
  requireApiPermissionMock: vi.fn(),
}));

vi.mock("@/lib/auth/api", () => ({
  isApiResponse: (value: unknown) => value instanceof Response,
  requireApiPermission: requireApiPermissionMock,
  withDemoHeader: (response: Response) => response,
}));

vi.mock("@/lib/auth/member-invites", () => ({
  acceptPendingMemberInvitesForUser: acceptPendingMemberInvitesForUserMock,
  findAuthUserByEmail: findAuthUserByEmailMock,
  normalizeInviteEmail: (email: string) => email.trim().toLowerCase(),
}));

vi.mock("@/lib/erp/demo-store", () => ({
  getDemoErpStore: vi.fn(),
}));

vi.mock("@/lib/erp/workspace-repository", () => ({
  loadSupabaseWorkspace: loadSupabaseWorkspaceMock,
}));

vi.mock("@/lib/observability/logger", () => ({
  logApiError: vi.fn(),
  logApiInfo: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createRequestSupabaseClient: () => ({ from: fromMock }),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceSupabaseClient: () => ({ kind: "service-client" }),
  isSupabaseServiceConfigured: () => true,
}));

import { POST } from "@/app/api/erp/members/route";

const businessId = "10000000-0000-4000-8000-000000000001";
const actorUserId = "20000000-0000-4000-8000-000000000001";
const targetUserId = "20000000-0000-4000-8000-000000000002";
const context = {
  businessId,
  demoMode: false,
  role: "owner",
  userEmail: "owner@example.com",
  userId: actorUserId,
  userName: "Owner Test",
};

function request() {
  return new Request("http://localhost/api/erp/members", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "Existing.User@Example.com",
      role: "staff",
      accessScope: "role",
      permissions: [],
      locationIds: [],
    }),
  });
}

function configureInviteQueries() {
  const pendingQuery = {
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  pendingQuery.eq.mockReturnValue(pendingQuery);

  const insertSingle = vi.fn().mockResolvedValue({
    data: { id: "30000000-0000-4000-8000-000000000001" },
    error: null,
  });
  const insertSelect = vi.fn(() => ({ single: insertSingle }));
  const insert = vi.fn(() => ({ select: insertSelect }));

  const revokeEq = vi.fn().mockResolvedValue({ data: null, error: null });
  const update = vi.fn(() => ({ eq: revokeEq }));

  const select = vi.fn(() => pendingQuery);
  fromMock.mockImplementation((table: string) => {
    if (table !== "member_invites") {
      throw new Error(`Unexpected direct table access: ${table}`);
    }

    return { insert, select, update };
  });

  return { insert, revokeEq, update };
}

describe("member invite route", () => {
  beforeEach(() => {
    requireApiPermissionMock.mockReset();
    requireApiPermissionMock.mockResolvedValue(context);
    findAuthUserByEmailMock.mockReset();
    findAuthUserByEmailMock.mockResolvedValue({
      id: targetUserId,
      email: "Existing.User@Example.com",
    });
    acceptPendingMemberInvitesForUserMock.mockReset();
    acceptPendingMemberInvitesForUserMock.mockResolvedValue(1);
    loadSupabaseWorkspaceMock.mockReset();
    loadSupabaseWorkspaceMock.mockResolvedValue({ business: { id: businessId } });
    fromMock.mockReset();
  });

  it("creates a bounded invite before adding an existing auth user through atomic acceptance", async () => {
    const { insert } = configureInviteQueries();

    const response = await POST(request());

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      member: { email: "existing.user@example.com", existingUser: true },
    });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      business_id: businessId,
      email: "existing.user@example.com",
      invited_by: actorUserId,
      role: "staff",
      status: "pending",
    }));
    expect(acceptPendingMemberInvitesForUserMock).toHaveBeenCalledWith(
      { kind: "service-client" },
      expect.objectContaining({ id: targetUserId }),
    );
    expect(fromMock).not.toHaveBeenCalledWith("business_members");
  });

  it("revokes the newly created invite if atomic acceptance rejects stale authority", async () => {
    const { revokeEq, update } = configureInviteQueries();
    acceptPendingMemberInvitesForUserMock.mockRejectedValue(
      new Error("The member invite authority is no longer valid."),
    );

    const response = await POST(request());

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: "Akses anggota gagal diterapkan secara aman.",
    });
    expect(update).toHaveBeenCalledWith({ status: "revoked" });
    expect(revokeEq).toHaveBeenCalledWith(
      "id",
      "30000000-0000-4000-8000-000000000001",
    );
    expect(fromMock).not.toHaveBeenCalledWith("business_members");
  });
});
