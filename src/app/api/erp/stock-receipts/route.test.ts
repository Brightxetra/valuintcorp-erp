import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  callActorServiceRpcMock,
  createIdempotentDemoStockReceiptMock,
  logApiErrorMock,
  logApiInfoMock,
  logApiWarningMock,
  requireApiPermissionMock,
} = vi.hoisted(() => ({
  callActorServiceRpcMock: vi.fn(),
  createIdempotentDemoStockReceiptMock: vi.fn(),
  logApiErrorMock: vi.fn(),
  logApiInfoMock: vi.fn(),
  logApiWarningMock: vi.fn(),
  requireApiPermissionMock: vi.fn(),
}));

vi.mock("@/lib/auth/api", () => ({
  isApiResponse: (value: unknown) => value instanceof Response,
  requireApiPermission: requireApiPermissionMock,
  withDemoHeader: (response: Response) => response,
}));

vi.mock("@/lib/erp/demo-store", () => ({
  createIdempotentDemoStockReceipt: createIdempotentDemoStockReceiptMock,
}));

vi.mock("@/lib/observability/logger", () => ({
  logApiError: logApiErrorMock,
  logApiInfo: logApiInfoMock,
  logApiWarning: logApiWarningMock,
}));

vi.mock("@/lib/supabase/service-rpc", () => ({
  callActorServiceRpc: callActorServiceRpcMock,
}));

import { POST } from "@/app/api/erp/stock-receipts/route";

const businessId = "10000000-0000-4000-8000-000000000001";
const userId = "20000000-0000-4000-8000-000000000001";
const itemId = "30000000-0000-4000-8000-000000000001";
const warehouseId = "40000000-0000-4000-8000-000000000001";
const operationKey = "50000000-0000-4000-8000-000000000001";
const movementId = "60000000-0000-4000-8000-000000000001";
const movement = {
  id: movementId,
  businessId,
  itemId,
  warehouseId,
  date: "2026-07-19",
  type: "purchase",
  quantity: 2,
  value: 25_000,
  memo: "Penerimaan manual",
};

const productionContext = {
  businessId,
  demoMode: false,
  role: "owner",
  userEmail: "owner@example.com",
  userId,
  userName: "Owner Test",
};

const validBody = {
  itemId,
  warehouseId,
  quantity: 2,
  unitCost: 12_500,
  date: "2026-07-19",
  memo: "Penerimaan manual",
};

function stockReceiptRequest(
  body: unknown = validBody,
  idempotencyKey: string | null = operationKey,
) {
  const headers = new Headers({ "content-type": "application/json" });

  if (idempotencyKey) {
    headers.set("Idempotency-Key", idempotencyKey);
  }

  return new Request("http://localhost/api/erp/stock-receipts", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("stock receipt route", () => {
  beforeEach(() => {
    requireApiPermissionMock.mockReset();
    requireApiPermissionMock.mockResolvedValue(productionContext);
    callActorServiceRpcMock.mockReset();
    callActorServiceRpcMock.mockResolvedValue({
      data: { movementId, created: true, replayed: false, movement },
      error: null,
      status: 200,
    });
    createIdempotentDemoStockReceiptMock.mockReset();
    logApiErrorMock.mockReset();
    logApiInfoMock.mockReset();
    logApiWarningMock.mockReset();
  });

  it("short-circuits when the inventory permission guard denies the request", async () => {
    const denied = Response.json({ error: "Forbidden" }, { status: 403 });
    requireApiPermissionMock.mockResolvedValue(denied);

    const response = await POST(stockReceiptRequest());

    expect(response).toBe(denied);
    expect(requireApiPermissionMock).toHaveBeenCalledWith(
      expect.any(Request),
      "inventory:manage",
    );
    expect(callActorServiceRpcMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid body before calling the command", async () => {
    const response = await POST(stockReceiptRequest({ ...validBody, quantity: 0 }));

    expect(response.status).toBe(400);
    expect(callActorServiceRpcMock).not.toHaveBeenCalled();
  });

  it.each([null, "not-a-uuid"])(
    "rejects a missing or malformed Idempotency-Key (%s)",
    async (key) => {
      const response = await POST(stockReceiptRequest(validBody, key));

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "Idempotency-Key header wajib berupa UUID yang valid.",
      });
      expect(callActorServiceRpcMock).not.toHaveBeenCalled();
    },
  );

  it("injects authoritative tenant, operation, and actor data into the service RPC", async () => {
    const response = await POST(
      stockReceiptRequest({
        ...validBody,
        businessId: "client-business-spoof",
        operationKey: "client-operation-spoof",
        actorName: "Client Actor Spoof",
        actorUserId: "client-user-spoof",
      }),
    );

    expect(response.status).toBe(201);
    expect(callActorServiceRpcMock).toHaveBeenCalledWith(
      "post_stock_receipt",
      {
        ...validBody,
        businessId,
        operationKey,
        actorName: "Owner Test",
      },
      userId,
    );
    await expect(response.json()).resolves.toEqual({
      movementId,
      created: true,
      replayed: false,
      movement,
    });
    expect(logApiInfoMock).toHaveBeenCalledWith(
      "erp.stock_receipt.created",
      expect.objectContaining({
        businessId,
        userId,
        route: "/api/erp/stock-receipts",
        status: "201",
      }),
    );
  });

  it("returns 200 when PostgreSQL confirms an idempotent replay", async () => {
    callActorServiceRpcMock.mockResolvedValue({
      data: { movementId, created: false, replayed: true, movement },
      error: null,
    });

    const response = await POST(stockReceiptRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      movementId,
      created: false,
      replayed: true,
      movement,
    });
    expect(logApiInfoMock).toHaveBeenCalledWith(
      "erp.stock_receipt.replayed",
      expect.objectContaining({ status: "200" }),
    );
  });

  it("accepts a movement matching the normalized four-decimal quantity", async () => {
    const response = await POST(
      stockReceiptRequest({ ...validBody, quantity: 2.00001 }),
    );

    expect(response.status).toBe(201);
    expect(callActorServiceRpcMock).toHaveBeenCalledWith(
      "post_stock_receipt",
      expect.objectContaining({ quantity: 2.00001 }),
      userId,
    );
  });

  it("matches PostgreSQL numeric rounding at an exact half-step", async () => {
    const canonicalMovement = {
      ...movement,
      quantity: 2.0009,
      value: 25_011.25,
    };
    callActorServiceRpcMock.mockResolvedValue({
      data: {
        movementId,
        created: true,
        replayed: false,
        movement: canonicalMovement,
      },
      error: null,
      status: 200,
    });

    const response = await POST(
      stockReceiptRequest({ ...validBody, quantity: 2.00085 }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      movement: canonicalMovement,
    });

    callActorServiceRpcMock.mockResolvedValue({
      data: {
        movementId,
        created: false,
        replayed: true,
        movement: canonicalMovement,
      },
      error: null,
      status: 200,
    });

    const replay = await POST(
      stockReceiptRequest({ ...validBody, quantity: 2.00085 }),
    );
    expect(replay.status).toBe(200);
  });

  it("maps conflicting reuse of an operation key to 409", async () => {
    callActorServiceRpcMock.mockResolvedValue({
      data: null,
      error: {
        code: "23505",
        message: "Idempotency key was already used for a different stock receipt.",
      },
    });

    const response = await POST(stockReceiptRequest());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "STOCK_RECEIPT_IDEMPOTENCY_CONFLICT",
    });
    expect(logApiWarningMock).toHaveBeenCalledWith(
      "erp.stock_receipt.conflict",
      expect.objectContaining({ status: "409" }),
    );
  });

  it.each([
    ["42501", 403],
    ["55000", 409],
    ["22023", 422],
    ["23503", 422],
    ["40001", 503],
    ["40P01", 503],
    ["55P03", 503],
    ["57014", 503],
    ["XX000", 500],
  ])("maps PostgreSQL error %s to HTTP %s", async (code, status) => {
    callActorServiceRpcMock.mockResolvedValue({
      data: null,
      error: { code, message: "backend detail must not escape" },
    });

    const response = await POST(stockReceiptRequest());
    const body = await response.json();

    expect(response.status).toBe(status);
    expect(body.error).not.toContain("backend detail");
  });

  it("maps a PostgREST transport failure with status zero to 503", async () => {
    callActorServiceRpcMock.mockResolvedValue({
      data: null,
      error: { code: "", message: "TypeError: fetch failed" },
      status: 0,
    });

    const response = await POST(stockReceiptRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "STOCK_RECEIPT_UNAVAILABLE",
    });
  });

  it("maps an upstream 5xx and a thrown transport failure to 503", async () => {
    callActorServiceRpcMock.mockResolvedValueOnce({
      data: null,
      error: { code: "XX000", message: "backend detail must not escape" },
      status: 500,
    });

    const upstreamResponse = await POST(stockReceiptRequest());
    expect(upstreamResponse.status).toBe(503);

    callActorServiceRpcMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    const thrownResponse = await POST(stockReceiptRequest());
    expect(thrownResponse.status).toBe(503);
  });

  it("rejects an invalid command result without claiming success", async () => {
    callActorServiceRpcMock.mockResolvedValue({
      data: { movementId, created: true, replayed: true, movement },
      error: null,
    });

    const response = await POST(stockReceiptRequest());

    expect(response.status).toBe(502);
  });

  it.each([
    { businessId: "10000000-0000-4000-8000-000000000099" },
    { itemId: "30000000-0000-4000-8000-000000000099" },
    { warehouseId: "40000000-0000-4000-8000-000000000099" },
    { date: "2026-07-18" },
    { quantity: 3 },
    { value: 25_001 },
    { memo: "Unexpected persisted memo" },
  ])("rejects an authoritative movement with the wrong canonical effect %o", async (override) => {
    callActorServiceRpcMock.mockResolvedValue({
      data: {
        movementId,
        created: true,
        replayed: false,
        movement: { ...movement, ...override },
      },
      error: null,
    });

    const response = await POST(stockReceiptRequest());

    expect(response.status).toBe(502);
    expect(logApiErrorMock).toHaveBeenCalledWith(
      "erp.stock_receipt.failed",
      expect.any(Error),
      expect.objectContaining({
        status: "502",
        details: { reason: "rpc_scope_mismatch" },
      }),
    );
  });

  it("rejects a non-purchase movement at the response schema boundary", async () => {
    callActorServiceRpcMock.mockResolvedValue({
      data: {
        movementId,
        created: true,
        replayed: false,
        movement: { ...movement, type: "sale" },
      },
      error: null,
    });

    const response = await POST(stockReceiptRequest());

    expect(response.status).toBe(502);
    expect(logApiErrorMock).toHaveBeenCalledWith(
      "erp.stock_receipt.failed",
      expect.any(Error),
      expect.objectContaining({
        status: "502",
        details: { reason: "invalid_rpc_response" },
      }),
    );
  });

  it("keeps demo receipts local while enforcing the idempotency header contract", async () => {
    const workspace = { business: { id: "demo-business" } };
    requireApiPermissionMock.mockResolvedValue({
      ...productionContext,
      businessId: "demo-business",
      demoMode: true,
    });
    createIdempotentDemoStockReceiptMock.mockReturnValue({
      workspace,
      created: true,
      replayed: false,
      conflict: false,
    });

    const response = await POST(
      stockReceiptRequest({
        ...validBody,
        itemId: "item-rendang",
        warehouseId: "warehouse-main",
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ workspace });
    expect(createIdempotentDemoStockReceiptMock).toHaveBeenCalledWith(
      {
        ...validBody,
        itemId: "item-rendang",
        warehouseId: "warehouse-main",
      },
      operationKey,
    );
    expect(callActorServiceRpcMock).not.toHaveBeenCalled();
  });

  it("returns 409 when demo fallback reuses a key for another payload", async () => {
    requireApiPermissionMock.mockResolvedValue({
      ...productionContext,
      businessId: "demo-business",
      demoMode: true,
    });
    createIdempotentDemoStockReceiptMock.mockReturnValue({
      workspace: { business: { id: "demo-business" } },
      created: false,
      replayed: false,
      conflict: true,
    });

    const response = await POST(stockReceiptRequest());

    expect(response.status).toBe(409);
    expect(logApiWarningMock).toHaveBeenCalledWith(
      "erp.stock_receipt.conflict",
      expect.objectContaining({ status: "409" }),
    );
  });
});
