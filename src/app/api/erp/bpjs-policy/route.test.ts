import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  callActorServiceRpcMock,
  createRequestSupabaseClientMock,
  eqMock,
  fromMock,
  maybeSingleMock,
  requireApiPermissionMock,
  selectMock,
} = vi.hoisted(() => ({
  callActorServiceRpcMock: vi.fn(),
  createRequestSupabaseClientMock: vi.fn(),
  eqMock: vi.fn(),
  fromMock: vi.fn(),
  maybeSingleMock: vi.fn(),
  requireApiPermissionMock: vi.fn(),
  selectMock: vi.fn(),
}));

vi.mock("@/lib/auth/api", () => ({
  isApiResponse: (value: unknown) => value instanceof Response,
  requireApiPermission: requireApiPermissionMock,
  withDemoHeader: (response: Response) => response,
}));

vi.mock("@/lib/supabase/service-rpc", () => ({
  callActorServiceRpc: callActorServiceRpcMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createRequestSupabaseClient: createRequestSupabaseClientMock,
}));

import { GET, POST } from "@/app/api/erp/bpjs-policy/route";

const businessId = "10000000-0000-4000-8000-000000000001";
const userId = "20000000-0000-4000-8000-000000000001";
const productionContext = {
  businessId,
  demoMode: false,
  role: "hr",
  userEmail: "hr@example.com",
  userId,
  userName: "HR Test",
};
const validBody = {
  effectiveDate: "2026-08-21",
  grossSalaryMultiplier: 1.1,
  healthEmployeeRate: 0.01,
  healthEmployerRate: 0.04,
  healthSalaryCap: 12_000_000,
  jhtEmployeeRate: 0.02,
  jhtEmployerRate: 0.037,
  jhtSalaryCap: 15_000_000,
  jpnEmployeeRate: 0.01,
  jpnEmployerRate: 0.02,
  jpnSalaryCap: 10_000_000,
  jkkEmployerRate: 0.0054,
  jkmEmployerRate: 0.003,
};
const savedRow = {
  id: "30000000-0000-4000-8000-000000000001",
  business_id: businessId,
  effective_date: validBody.effectiveDate,
  gross_salary_multiplier: String(validBody.grossSalaryMultiplier),
  health_employee_rate: String(validBody.healthEmployeeRate),
  health_employer_rate: String(validBody.healthEmployerRate),
  health_salary_cap: String(validBody.healthSalaryCap),
  jht_employee_rate: String(validBody.jhtEmployeeRate),
  jht_employer_rate: String(validBody.jhtEmployerRate),
  jht_salary_cap: String(validBody.jhtSalaryCap),
  jpn_employee_rate: String(validBody.jpnEmployeeRate),
  jpn_employer_rate: String(validBody.jpnEmployerRate),
  jpn_salary_cap: String(validBody.jpnSalaryCap),
  jkk_employer_rate: String(validBody.jkkEmployerRate),
  jkm_employer_rate: String(validBody.jkmEmployerRate),
  updated_at: "2026-08-21T07:45:00.000Z",
};

function getRequest() {
  return new Request("http://localhost/api/erp/bpjs-policy");
}

function postRequest(body: unknown = validBody) {
  return new Request("http://localhost/api/erp/bpjs-policy", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("BPJS policy route", () => {
  beforeEach(() => {
    requireApiPermissionMock.mockReset();
    requireApiPermissionMock.mockResolvedValue(productionContext);
    callActorServiceRpcMock.mockReset();
    callActorServiceRpcMock.mockResolvedValue({ data: savedRow, error: null });
    maybeSingleMock.mockReset();
    maybeSingleMock.mockResolvedValue({ data: savedRow, error: null });
    eqMock.mockReset();
    eqMock.mockReturnValue({ maybeSingle: maybeSingleMock });
    selectMock.mockReset();
    selectMock.mockReturnValue({ eq: eqMock });
    fromMock.mockReset();
    fromMock.mockReturnValue({ select: selectMock });
    createRequestSupabaseClientMock.mockReset();
    createRequestSupabaseClientMock.mockReturnValue({ from: fromMock });
  });

  it("requires payroll permission and scopes reads to the active business", async () => {
    const response = await GET(getRequest());

    expect(response.status).toBe(200);
    expect(requireApiPermissionMock).toHaveBeenCalledWith(expect.any(Request), "payroll:run");
    expect(fromMock).toHaveBeenCalledWith("bpjs_policies");
    expect(eqMock).toHaveBeenCalledWith("business_id", businessId);
    expect(callActorServiceRpcMock).not.toHaveBeenCalled();
  });

  it("routes writes through the actor-bound service command", async () => {
    const response = await POST(postRequest({
      ...validBody,
      businessId: "10000000-0000-4000-8000-000000000099",
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(requireApiPermissionMock).toHaveBeenCalledWith(expect.any(Request), "hr:manage");
    expect(callActorServiceRpcMock).toHaveBeenCalledWith(
      "upsert_bpjs_policy",
      { ...validBody, businessId },
      userId,
    );
    expect(body.policy).toMatchObject({
      id: savedRow.id,
      businessId,
      effectiveDate: validBody.effectiveDate,
      healthEmployeeRate: validBody.healthEmployeeRate,
      updatedAt: savedRow.updated_at,
    });
    expect(createRequestSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("rejects invalid input before invoking the database command", async () => {
    const response = await POST(postRequest({ ...validBody, healthEmployeeRate: 2 }));

    expect(response.status).toBe(400);
    expect(callActorServiceRpcMock).not.toHaveBeenCalled();
  });

  it("keeps database error details out of the response", async () => {
    callActorServiceRpcMock.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "sensitive membership and policy detail" },
    });

    const response = await POST(postRequest());
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toEqual({ error: "Konfigurasi BPJS gagal disimpan." });
    expect(JSON.stringify(body)).not.toContain("sensitive");
  });

  it("keeps read error details out of the response", async () => {
    maybeSingleMock.mockResolvedValue({
      data: null,
      error: { code: "XX000", message: "sensitive database topology" },
    });

    const response = await GET(getRequest());
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toEqual({ error: "Konfigurasi BPJS gagal dimuat." });
    expect(JSON.stringify(body)).not.toContain("sensitive");
  });

  it("reports a missing security migration without exposing backend details", async () => {
    callActorServiceRpcMock.mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "upsert_bpjs_policy was not found" },
    });

    const response = await POST(postRequest());

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: "Upgrade keamanan konfigurasi BPJS belum diterapkan.",
    });
  });

  it("rejects malformed command output", async () => {
    callActorServiceRpcMock.mockResolvedValue({ data: null, error: null });

    const response = await POST(postRequest());

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: "Konfigurasi BPJS gagal disimpan.",
    });
  });

  it("rejects a command response for a different tenant", async () => {
    callActorServiceRpcMock.mockResolvedValue({
      data: {
        ...savedRow,
        business_id: "10000000-0000-4000-8000-000000000099",
      },
      error: null,
    });

    const response = await POST(postRequest());

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: "Konfigurasi BPJS gagal disimpan.",
    });
  });

  it("maps service transport failures to a retryable generic response", async () => {
    callActorServiceRpcMock.mockRejectedValue(new TypeError("fetch failed with backend URL"));

    const response = await POST(postRequest());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      error: "Layanan konfigurasi BPJS sementara tidak tersedia.",
      code: "BPJS_POLICY_UNAVAILABLE",
    });
    expect(JSON.stringify(body)).not.toContain("backend URL");
  });

  it("keeps demo saves local and does not call Supabase", async () => {
    requireApiPermissionMock.mockResolvedValue({ ...productionContext, demoMode: true });

    const response = await POST(postRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.policy).toMatchObject({ ...validBody, businessId });
    expect(callActorServiceRpcMock).not.toHaveBeenCalled();
    expect(createRequestSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("stops before storage when authorization fails", async () => {
    requireApiPermissionMock.mockResolvedValue(
      Response.json({ error: "Forbidden" }, { status: 403 }),
    );

    const getResponse = await GET(getRequest());
    const postResponse = await POST(postRequest());

    expect(getResponse.status).toBe(403);
    expect(postResponse.status).toBe(403);
    expect(createRequestSupabaseClientMock).not.toHaveBeenCalled();
    expect(callActorServiceRpcMock).not.toHaveBeenCalled();
  });
});
