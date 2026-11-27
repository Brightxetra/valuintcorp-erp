import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  callActorServiceRpcMock,
  loadSupabaseWorkspaceMock,
  requireApiPermissionMock,
} = vi.hoisted(() => ({
  callActorServiceRpcMock: vi.fn(),
  loadSupabaseWorkspaceMock: vi.fn(),
  requireApiPermissionMock: vi.fn(),
}));

vi.mock("@/lib/auth/api", () => ({
  isApiResponse: (value: unknown) => value instanceof Response,
  requireApiPermission: requireApiPermissionMock,
  withDemoHeader: (response: Response) => response,
}));

vi.mock("@/lib/erp/demo-store", () => ({
  lockDemoPeriod: vi.fn(),
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

import { POST } from "@/app/api/erp/period-lock/route";

const businessId = "10000000-0000-4000-8000-000000000001";
const userId = "20000000-0000-4000-8000-000000000001";
const productionContext = {
  businessId,
  demoMode: false,
  role: "owner",
  userEmail: "owner@example.com",
  userId,
  userName: "Owner Test",
};
const validBody = {
  label: "Juli 2026",
  startDate: "2026-07-01",
  endDate: "2026-07-31",
  locked: true,
};

function periodLockRequest(body: unknown = validBody) {
  return new Request("http://localhost/api/erp/period-lock", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("period lock route", () => {
  beforeEach(() => {
    requireApiPermissionMock.mockReset();
    requireApiPermissionMock.mockResolvedValue(productionContext);
    callActorServiceRpcMock.mockReset();
    loadSupabaseWorkspaceMock.mockReset();
  });

  it("maps PostgreSQL lock contention to a redacted retryable conflict", async () => {
    callActorServiceRpcMock.mockResolvedValue({
      data: null,
      error: {
        code: "55P03",
        message: "posting activity is in flight with sensitive backend detail",
      },
    });

    const response = await POST(periodLockRequest());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toEqual({
      error: "Periode sedang digunakan oleh proses posting. Coba lagi beberapa saat.",
      code: "PERIOD_LOCK_BUSY",
      retryable: true,
    });
    expect(JSON.stringify(body)).not.toContain("sensitive backend detail");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(loadSupabaseWorkspaceMock).not.toHaveBeenCalled();
  });

  it("keeps other PostgreSQL errors redacted without changing their status", async () => {
    callActorServiceRpcMock.mockResolvedValue({
      data: null,
      error: {
        code: "XX000",
        message: "sensitive backend detail",
      },
    });

    const response = await POST(periodLockRequest());

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: "Status periode gagal diperbarui.",
    });
    expect(loadSupabaseWorkspaceMock).not.toHaveBeenCalled();
  });
});
