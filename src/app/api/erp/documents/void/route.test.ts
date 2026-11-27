import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  callActorServiceRpcMock,
  loadSupabaseWorkspaceMock,
  requireApiMembershipMock,
} = vi.hoisted(() => ({
  callActorServiceRpcMock: vi.fn(),
  loadSupabaseWorkspaceMock: vi.fn(),
  requireApiMembershipMock: vi.fn(),
}));

vi.mock("@/lib/auth/api", () => ({
  isApiResponse: (value: unknown) => value instanceof Response,
  requireApiMembership: requireApiMembershipMock,
  withDemoHeader: (response: Response) => response,
}));

vi.mock("@/lib/erp/demo-store", () => ({
  voidDemoDocument: vi.fn(),
}));

vi.mock("@/lib/erp/workspace-repository", () => ({
  loadSupabaseWorkspace: loadSupabaseWorkspaceMock,
}));

vi.mock("@/lib/supabase/service-rpc", () => ({
  callActorServiceRpc: callActorServiceRpcMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createRequestSupabaseClient: vi.fn(() => ({})),
}));

import { POST } from "@/app/api/erp/documents/void/route";

const businessId = "10000000-0000-4000-8000-000000000001";
const userId = "20000000-0000-4000-8000-000000000001";

function context(permissions: Array<"accounting:write" | "inventory:manage">) {
  return {
    accessScope: "custom",
    assignedLocationIds: [],
    businessId,
    demoMode: false,
    permissions,
    role: "staff",
    userEmail: "staff@example.com",
    userId,
    userName: "Staff Test",
  };
}

function voidRequest(documentType: "purchase_bill" | "stock_adjustment") {
  return new Request("http://localhost/api/erp/documents/void", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      documentType,
      documentId: "30000000-0000-4000-8000-000000000001",
      date: "2026-08-21",
      reason: "Verified correction",
    }),
  });
}

describe("document void route permission boundary", () => {
  beforeEach(() => {
    requireApiMembershipMock.mockReset();
    callActorServiceRpcMock.mockReset();
    callActorServiceRpcMock.mockResolvedValue({ data: null, error: null });
    loadSupabaseWorkspaceMock.mockReset();
    loadSupabaseWorkspaceMock.mockResolvedValue({ id: "workspace" });
  });

  it("uses inventory:manage for inventory reversals", async () => {
    requireApiMembershipMock.mockResolvedValue(context(["inventory:manage"]));

    const response = await POST(voidRequest("stock_adjustment"));

    expect(response.status).toBe(200);
    expect(callActorServiceRpcMock).toHaveBeenCalledWith(
      "void_document",
      expect.objectContaining({
        businessId,
        documentType: "stock_adjustment",
      }),
      userId,
    );
  });

  it("rejects accounting-only members from inventory reversals", async () => {
    requireApiMembershipMock.mockResolvedValue(context(["accounting:write"]));

    const response = await POST(voidRequest("stock_adjustment"));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Role staff is not allowed to perform inventory:manage.",
    });
    expect(callActorServiceRpcMock).not.toHaveBeenCalled();
  });

  it("preserves accounting:write for financial reversals", async () => {
    requireApiMembershipMock.mockResolvedValue(context(["accounting:write"]));

    const response = await POST(voidRequest("purchase_bill"));

    expect(response.status).toBe(200);
    expect(callActorServiceRpcMock).toHaveBeenCalledWith(
      "void_document",
      expect.objectContaining({
        businessId,
        documentType: "purchase_bill",
      }),
      userId,
    );
  });

  it("rejects inventory-only members from financial reversals", async () => {
    requireApiMembershipMock.mockResolvedValue(context(["inventory:manage"]));

    const response = await POST(voidRequest("purchase_bill"));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Role staff is not allowed to perform accounting:write.",
    });
    expect(callActorServiceRpcMock).not.toHaveBeenCalled();
  });
});
