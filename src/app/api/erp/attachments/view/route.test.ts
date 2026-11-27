import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createRequestSupabaseClientMock,
  createServiceSupabaseClientMock,
  createSignedUrlMock,
  maybeSingleMock,
  requireApiMembershipMock,
} = vi.hoisted(() => ({
  createRequestSupabaseClientMock: vi.fn(),
  createServiceSupabaseClientMock: vi.fn(),
  createSignedUrlMock: vi.fn(),
  maybeSingleMock: vi.fn(),
  requireApiMembershipMock: vi.fn(),
}));

vi.mock("@/lib/auth/api", () => ({
  isApiResponse: (value: unknown) => value instanceof Response,
  requireApiMembership: requireApiMembershipMock,
  withDemoHeader: (response: Response) => response,
}));

vi.mock("@/lib/erp/demo-store", () => ({
  getDemoErpStore: vi.fn(() => ({ attachments: [] })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createRequestSupabaseClient: createRequestSupabaseClientMock,
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceSupabaseClient: createServiceSupabaseClientMock,
}));

import { GET } from "@/app/api/erp/attachments/view/route";

const context = {
  accessScope: "custom",
  assignedLocationIds: ["location-1"],
  businessId: "business-1",
  demoMode: false,
  permissions: ["accounting:read"],
  role: "finance_admin",
  userId: "actor-1",
};

function queryClient() {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: maybeSingleMock,
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return { from: vi.fn(() => query) };
}

describe("attachment signed download capability", () => {
  beforeEach(() => {
    requireApiMembershipMock.mockReset();
    requireApiMembershipMock.mockResolvedValue(context);
    maybeSingleMock.mockReset();
    maybeSingleMock.mockResolvedValue({
      data: { id: "attachment-1", storage_path: "business-1/sales_invoice/invoice-1/file.pdf" },
      error: null,
    });
    createRequestSupabaseClientMock.mockReset();
    createRequestSupabaseClientMock.mockReturnValue(queryClient());
    createSignedUrlMock.mockReset();
    createSignedUrlMock.mockResolvedValue({ data: { signedUrl: "https://signed.example/file" }, error: null });
    createServiceSupabaseClientMock.mockReset();
    createServiceSupabaseClientMock.mockReturnValue({
      storage: { from: vi.fn(() => ({ createSignedUrl: createSignedUrlMock })) },
    });
  });

  it("rejects a missing attachment id before database or Storage access", async () => {
    const response = await GET(new Request("http://localhost/api/erp/attachments/view"));

    expect(response.status).toBe(400);
    expect(createRequestSupabaseClientMock).not.toHaveBeenCalled();
    expect(createServiceSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("mints a five-minute URL only after the RLS-filtered metadata lookup", async () => {
    const response = await GET(new Request("http://localhost/api/erp/attachments/view?id=attachment-1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(maybeSingleMock).toHaveBeenCalled();
    expect(createSignedUrlMock).toHaveBeenCalledWith(
      "business-1/sales_invoice/invoice-1/file.pdf",
      300,
    );
    expect(body).toEqual({ signedUrl: "https://signed.example/file", expiresIn: 300 });
  });
});
