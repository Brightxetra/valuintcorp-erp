import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createRequestSupabaseClientMock,
  getDemoErpStoreMock,
  loadSupabaseWorkspaceMock,
  requireApiMembershipMock,
  requireApiPermissionMock,
} = vi.hoisted(() => ({
  createRequestSupabaseClientMock: vi.fn(),
  getDemoErpStoreMock: vi.fn(),
  loadSupabaseWorkspaceMock: vi.fn(),
  requireApiMembershipMock: vi.fn(),
  requireApiPermissionMock: vi.fn(),
}));

vi.mock("@/lib/auth/api", () => ({
  isApiResponse: (value: unknown) => value instanceof Response,
  requireApiMembership: requireApiMembershipMock,
  requireApiPermission: requireApiPermissionMock,
  withDemoHeader: (response: Response) => response,
}));

vi.mock("@/lib/erp/demo-store", () => ({
  getDemoErpStore: getDemoErpStoreMock,
}));

vi.mock("@/lib/erp/workspace-repository", () => ({
  loadSupabaseWorkspace: loadSupabaseWorkspaceMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createRequestSupabaseClient: createRequestSupabaseClientMock,
}));

import { GET } from "@/app/api/erp/workspace/route";

const productionContext = {
  accessScope: "custom",
  assignedLocationIds: [],
  businessId: "10000000-0000-4000-8000-000000000001",
  demoMode: false,
  permissions: ["business:read", "payroll:run"],
  role: "finance_admin",
  userId: "20000000-0000-4000-8000-000000000001",
};

function workspaceRequest(profile?: string) {
  const url = new URL("http://localhost/api/erp/workspace");
  if (profile !== undefined) url.searchParams.set("profile", profile);
  return new Request(url);
}

describe("workspace route profile authorization", () => {
  beforeEach(() => {
    requireApiPermissionMock.mockReset();
    requireApiPermissionMock.mockResolvedValue(productionContext);
    requireApiMembershipMock.mockReset();
    requireApiMembershipMock.mockResolvedValue(productionContext);
    loadSupabaseWorkspaceMock.mockReset();
    loadSupabaseWorkspaceMock.mockResolvedValue({ business: { id: productionContext.businessId } });
    createRequestSupabaseClientMock.mockReset();
    createRequestSupabaseClientMock.mockReturnValue({ kind: "request-client" });
    getDemoErpStoreMock.mockReset();
  });

  it.each([undefined, "unknown", "full", "document-detail"])(
    "rejects unsupported public profile %s before authentication or data access",
    async (profile) => {
      const response = await GET(workspaceRequest(profile));

      expect(response.status).toBe(400);
      expect(requireApiMembershipMock).not.toHaveBeenCalled();
      expect(requireApiPermissionMock).not.toHaveBeenCalled();
      expect(createRequestSupabaseClientMock).not.toHaveBeenCalled();
      expect(loadSupabaseWorkspaceMock).not.toHaveBeenCalled();
    },
  );

  it("denies payroll before workspace queries when payroll permission is missing", async () => {
    const denied = Response.json({ error: "Forbidden" }, { status: 403 });
    requireApiPermissionMock.mockResolvedValue(denied);

    const response = await GET(workspaceRequest("payroll"));

    expect(response).toBe(denied);
    expect(requireApiPermissionMock).toHaveBeenCalledWith(expect.any(Request), "payroll:run");
    expect(requireApiMembershipMock).not.toHaveBeenCalled();
    expect(createRequestSupabaseClientMock).not.toHaveBeenCalled();
    expect(loadSupabaseWorkspaceMock).not.toHaveBeenCalled();
  });

  it("loads only the authorized payroll profile", async () => {
    const response = await GET(workspaceRequest("payroll"));

    expect(response.status).toBe(200);
    expect(requireApiPermissionMock).toHaveBeenCalledWith(expect.any(Request), "payroll:run");
    expect(loadSupabaseWorkspaceMock).toHaveBeenCalledWith(
      { kind: "request-client" },
      productionContext,
      { profile: "payroll" },
    );
  });

  it.each([
    ["shell", null],
    ["dashboard", "business:read"],
    ["sales", "accounting:write"],
    ["purchases", "accounting:write"],
    ["cash", "accounting:write"],
    ["inventory", "inventory:manage"],
    ["pricing", "inventory:manage"],
    ["accounting", "accounting:read"],
    ["reports", "reports:export"],
    ["tax", "tax:prepare"],
    ["hr", "hr:manage"],
    ["payroll", "payroll:run"],
    ["assets", "accounting:read"],
    ["settings", "business:read"],
    ["onboarding", "business:update"],
    ["pos", "pos:read"],
  ] as const)("maps public profile %s to permission %s", async (profile, permission) => {
    const denied = Response.json({ error: "Forbidden" }, { status: 403 });
    if (permission) {
      requireApiPermissionMock.mockResolvedValue(denied);
    } else {
      requireApiMembershipMock.mockResolvedValue(denied);
    }

    const response = await GET(workspaceRequest(profile));

    expect(response.status).toBe(403);
    if (permission) {
      expect(requireApiPermissionMock).toHaveBeenCalledWith(expect.any(Request), permission);
      expect(requireApiMembershipMock).not.toHaveBeenCalled();
    } else {
      expect(requireApiMembershipMock).toHaveBeenCalledWith(expect.any(Request));
      expect(requireApiPermissionMock).not.toHaveBeenCalled();
    }
    expect(loadSupabaseWorkspaceMock).not.toHaveBeenCalled();
  });
});
