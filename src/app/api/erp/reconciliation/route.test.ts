import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createServiceSupabaseClientMock,
  requireApiPermissionMock,
  rpcMock,
} = vi.hoisted(() => ({
  createServiceSupabaseClientMock: vi.fn(),
  requireApiPermissionMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock("@/lib/auth/api", () => ({
  isApiResponse: (value: unknown) => value instanceof Response,
  requireApiPermission: requireApiPermissionMock,
  withDemoHeader: (response: Response) => response,
}));

vi.mock("@/lib/erp/demo-store", () => ({
  getDemoErpStore: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceSupabaseClient: createServiceSupabaseClientMock,
}));

import { GET } from "@/app/api/erp/reconciliation/route";

const context = {
  accessScope: "custom",
  assignedLocationIds: ["location-1"],
  businessId: "business-1",
  demoMode: false,
  permissions: ["accounting:read"],
  role: "finance_admin",
  userId: "actor-1",
};

describe("reconciliation actor binding", () => {
  beforeEach(() => {
    requireApiPermissionMock.mockReset();
    requireApiPermissionMock.mockResolvedValue(context);
    rpcMock.mockReset();
    rpcMock.mockResolvedValue({ data: [], error: null });
    createServiceSupabaseClientMock.mockReset();
    createServiceSupabaseClientMock.mockReturnValue({ rpc: rpcMock });
  });

  it("stops before the service client when accounting permission is denied", async () => {
    const denied = Response.json({ error: "Forbidden" }, { status: 403 });
    requireApiPermissionMock.mockResolvedValue(denied);

    const response = await GET(new Request("http://localhost/api/erp/reconciliation"));

    expect(response).toBe(denied);
    expect(createServiceSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("calls only the service RPC with the verified actor and requested scope", async () => {
    const response = await GET(
      new Request("http://localhost/api/erp/reconciliation?locationId=location-1&source=pos&dateFrom=2026-08-01&dateTo=2026-08-31"),
    );

    expect(response.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith("reconciliation_rollup", {
      target_business_id: "business-1",
      actor_user_id: "actor-1",
      target_location_id: "location-1",
      target_source: "pos",
      target_date_from: "2026-08-01",
      target_date_to: "2026-08-31",
      result_limit: 500,
    });
  });
});
