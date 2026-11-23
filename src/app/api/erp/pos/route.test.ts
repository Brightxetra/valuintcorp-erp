import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  callActorServiceRpcMock,
  createDemoPaymentMock,
  createDemoSalesInvoiceMock,
  getDemoErpStoreMock,
  requireApiPermissionMock,
} = vi.hoisted(() => ({
  callActorServiceRpcMock: vi.fn(),
  createDemoPaymentMock: vi.fn(),
  createDemoSalesInvoiceMock: vi.fn(),
  getDemoErpStoreMock: vi.fn(),
  requireApiPermissionMock: vi.fn(),
}));

vi.mock("@/lib/auth/api", () => ({
  isApiResponse: (value: unknown) => value instanceof Response,
  requireApiPermission: requireApiPermissionMock,
  withDemoHeader: (response: Response) => response,
}));

vi.mock("@/lib/erp/demo-store", () => ({
  createDemoPayment: createDemoPaymentMock,
  createDemoSalesInvoice: createDemoSalesInvoiceMock,
  getDemoBranchExpenses: vi.fn(),
  getDemoErpStore: getDemoErpStoreMock,
}));

vi.mock("@/lib/supabase/service-rpc", () => ({
  callActorServiceRpc: callActorServiceRpcMock,
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceSupabaseClient: vi.fn(),
}));

import { POST } from "@/app/api/erp/pos/route";

const businessId = "10000000-0000-4000-8000-000000000001";
const userId = "20000000-0000-4000-8000-000000000001";
const locationId = "30000000-0000-4000-8000-000000000001";
const warehouseId = "40000000-0000-4000-8000-000000000001";
const productId = "50000000-0000-4000-8000-000000000001";
const customerId = "60000000-0000-4000-8000-000000000001";
const saleId = "70000000-0000-4000-8000-000000000001";

const productionContext = {
  businessId,
  demoMode: false,
  role: "owner",
  accessScope: "role",
  assignedLocationIds: [],
  userEmail: "owner@example.com",
  userId,
  userName: "Owner Test",
};

const validBody = {
  locationId,
  date: "2026-08-21",
  paymentMethod: "cash",
  items: [{ productId, quantity: 2 }],
};

function postRequest(body: unknown = validBody) {
  return new Request("http://localhost/api/erp/pos", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function demoWorkspace(sellingPrice = 25_000) {
  return {
    business: { id: businessId },
    locations: [
      {
        id: locationId,
        businessId,
        type: "branch",
        isActive: true,
        warehouseId,
      },
    ],
    customers: [
      {
        id: customerId,
        businessId,
        isActive: true,
        creditLimit: 1_000_000,
      },
    ],
    products: [
      {
        id: productId,
        businessId,
        name: "Produk Aman",
        sellingPrice,
        isActive: true,
        isSellable: true,
      },
    ],
  };
}

describe("POS sale route", () => {
  beforeEach(() => {
    requireApiPermissionMock.mockReset();
    requireApiPermissionMock.mockResolvedValue(productionContext);
    callActorServiceRpcMock.mockReset();
    callActorServiceRpcMock.mockResolvedValue({ data: saleId, error: null });
    getDemoErpStoreMock.mockReset();
    createDemoSalesInvoiceMock.mockReset();
    createDemoPaymentMock.mockReset();
  });

  it("stops before posting when the POS permission guard denies the request", async () => {
    const denied = Response.json({ error: "Forbidden" }, { status: 403 });
    requireApiPermissionMock.mockResolvedValue(denied);

    const response = await POST(postRequest());

    expect(response).toBe(denied);
    expect(requireApiPermissionMock).toHaveBeenCalledWith(expect.any(Request), "pos:sell");
    expect(callActorServiceRpcMock).not.toHaveBeenCalled();
  });

  it("rejects invalid quantity before invoking PostgreSQL", async () => {
    const response = await POST(
      postRequest({ ...validBody, items: [{ productId, quantity: 0 }] }),
    );

    expect(response.status).toBe(400);
    expect(callActorServiceRpcMock).not.toHaveBeenCalled();
  });

  it("posts a legitimate sale without requiring a caller price", async () => {
    const response = await POST(postRequest());

    expect(response.status).toBe(201);
    expect(callActorServiceRpcMock).toHaveBeenCalledWith(
      "post_pos_sale_v2",
      { ...validBody, businessId },
      userId,
    );
    await expect(response.json()).resolves.toEqual({ saleId });
  });

  it.each([0, -1, 1, 999_999_999])(
    "strips caller unitPrice=%s before invoking the authoritative command",
    async (unitPrice) => {
      const response = await POST(
        postRequest({
          ...validBody,
          items: [{ productId, quantity: 2, unitPrice }],
        }),
      );

      expect(response.status).toBe(201);
      expect(callActorServiceRpcMock).toHaveBeenCalledWith(
        "post_pos_sale_v2",
        {
          ...validBody,
          businessId,
          items: [{ productId, quantity: 2 }],
        },
        userId,
      );
    },
  );

  it("keeps database error details out of the response", async () => {
    callActorServiceRpcMock.mockResolvedValue({
      data: null,
      error: { code: "22023", message: "sensitive catalog and tenant detail" },
    });

    const response = await POST(postRequest());
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toEqual({ error: "Transaksi POS gagal diposting." });
    expect(JSON.stringify(body)).not.toContain("sensitive");
  });

  it("fails closed when the versioned pricing command is not installed", async () => {
    callActorServiceRpcMock.mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "post_pos_sale_v2 was not found" },
    });

    const response = await POST(postRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Upgrade keamanan harga POS belum diterapkan.",
    });
  });

  it("maps service transport failures to a retryable response", async () => {
    callActorServiceRpcMock.mockRejectedValue(
      new TypeError("fetch failed with backend URL"),
    );

    const response = await POST(postRequest());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ error: "Layanan POS sementara tidak tersedia." });
    expect(JSON.stringify(body)).not.toContain("backend URL");
  });

  it("uses the demo catalog price even when the caller supplies another price", async () => {
    requireApiPermissionMock.mockResolvedValue({
      ...productionContext,
      demoMode: true,
    });
    getDemoErpStoreMock.mockReturnValue(demoWorkspace());
    createDemoSalesInvoiceMock.mockReturnValue({
      salesInvoices: [{ id: saleId, total: 50_000 }],
    });
    createDemoPaymentMock.mockReturnValue({ salesInvoices: [] });

    const response = await POST(
      postRequest({
        ...validBody,
        items: [{ productId, quantity: 2, unitPrice: 1 }],
      }),
    );

    expect(response.status).toBe(201);
    expect(createDemoSalesInvoiceMock).toHaveBeenCalledWith(
      {
        customerId,
        date: validBody.date,
        dueDate: validBody.date,
        items: [
          {
            productId,
            quantity: 2,
            unitPrice: 25_000,
            warehouseId,
          },
        ],
      },
      { locationId, source: "pos" },
    );
    expect(createDemoPaymentMock).toHaveBeenCalledWith({
      direction: "inbound",
      documentType: "sales_invoice",
      documentId: saleId,
      amount: 50_000,
      method: "cash",
      date: validBody.date,
    });
    expect(callActorServiceRpcMock).not.toHaveBeenCalled();
  });

  it("rejects a non-positive demo catalog price before any document is created", async () => {
    requireApiPermissionMock.mockResolvedValue({
      ...productionContext,
      demoMode: true,
    });
    getDemoErpStoreMock.mockReturnValue(demoWorkspace(0));

    const response = await POST(postRequest());

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: "Harga jual Produk Aman belum ditetapkan.",
    });
    expect(createDemoSalesInvoiceMock).not.toHaveBeenCalled();
    expect(createDemoPaymentMock).not.toHaveBeenCalled();
  });
});
