import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  buildBalanceSheetMock,
  buildDashboardMetricsMock,
  buildIncomeStatementMock,
  createRequestSupabaseClientMock,
  getDemoErpStoreMock,
  loadSupabaseWorkspaceMock,
  prepareCoretaxPackageMock,
  requireApiMembershipMock,
} = vi.hoisted(() => ({
  buildBalanceSheetMock: vi.fn(() => ({ report: "balance-sheet" })),
  buildDashboardMetricsMock: vi.fn(() => ({ report: "dashboard" })),
  buildIncomeStatementMock: vi.fn(() => ({ report: "income-statement" })),
  createRequestSupabaseClientMock: vi.fn(() => ({ kind: "request-client" })),
  getDemoErpStoreMock: vi.fn(),
  loadSupabaseWorkspaceMock: vi.fn(),
  prepareCoretaxPackageMock: vi.fn(() => ({ package: "coretax" })),
  requireApiMembershipMock: vi.fn(),
}));

vi.mock("@/lib/auth/api", () => ({
  isApiResponse: (value: unknown) => value instanceof Response,
  requireApiMembership: requireApiMembershipMock,
  withDemoHeader: (response: Response) => response,
}));

vi.mock("@/lib/erp/demo-store", () => ({
  getDemoErpStore: getDemoErpStoreMock,
}));

vi.mock("@/lib/erp/workspace-repository", () => ({
  loadSupabaseWorkspace: loadSupabaseWorkspaceMock,
}));

vi.mock("@/lib/reports/reports", () => ({
  buildBalanceSheet: buildBalanceSheetMock,
  buildDashboardMetrics: buildDashboardMetricsMock,
  buildIncomeStatement: buildIncomeStatementMock,
}));

vi.mock("@/lib/tax/coretax", () => ({
  prepareCoretaxPackage: prepareCoretaxPackageMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createRequestSupabaseClient: createRequestSupabaseClientMock,
}));

import { GET } from "@/app/api/reports/demo/route";

const workspace = {
  business: {
    id: "business-1",
    displayName: "Safe display",
    industry: "retail",
    baseCurrency: "IDR",
    legalName: "Sensitive legal name",
    ownerName: "Sensitive owner",
    taxId: "Sensitive tax id",
  },
  journals: [],
  period: { label: "2026-08", startDate: "2026-08-01", endDate: "2026-08-31", locked: false },
  taxProfile: { id: "tax-1" },
};

function context(permissions: string[]) {
  return {
    accessScope: "custom",
    assignedLocationIds: [],
    businessId: "business-1",
    demoMode: false,
    permissions,
    role: "finance_admin",
    userId: "user-1",
  };
}

describe("reports demo permission projections", () => {
  beforeEach(() => {
    requireApiMembershipMock.mockReset();
    loadSupabaseWorkspaceMock.mockReset();
    loadSupabaseWorkspaceMock.mockResolvedValue(workspace);
    createRequestSupabaseClientMock.mockClear();
    buildBalanceSheetMock.mockClear();
    buildDashboardMetricsMock.mockClear();
    buildIncomeStatementMock.mockClear();
    prepareCoretaxPackageMock.mockClear();
  });

  it("denies accounting read alone before any workspace query", async () => {
    requireApiMembershipMock.mockResolvedValue(context(["accounting:read"]));

    const response = await GET(new Request("http://localhost/api/reports/demo"));

    expect(response.status).toBe(403);
    expect(loadSupabaseWorkspaceMock).not.toHaveBeenCalled();
    expect(createRequestSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("returns financial reports without Coretax or sensitive business identity", async () => {
    const reportsContext = context(["reports:export"]);
    requireApiMembershipMock.mockResolvedValue(reportsContext);

    const response = await GET(new Request("http://localhost/api/reports/demo"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(loadSupabaseWorkspaceMock).toHaveBeenCalledWith(
      { kind: "request-client" },
      reportsContext,
      { profile: "reports" },
    );
    expect(body).toMatchObject({
      business: { id: "business-1", displayName: "Safe display", industry: "retail", baseCurrency: "IDR" },
      dashboard: { report: "dashboard" },
      incomeStatement: { report: "income-statement" },
      balanceSheet: { report: "balance-sheet" },
    });
    expect(body.business).not.toHaveProperty("taxId");
    expect(body.business).not.toHaveProperty("legalName");
    expect(body.business).not.toHaveProperty("ownerName");
    expect(body).not.toHaveProperty("coretax");
    expect(prepareCoretaxPackageMock).not.toHaveBeenCalled();
  });

  it("returns only the Coretax package to tax preparation access", async () => {
    const taxContext = context(["tax:prepare"]);
    requireApiMembershipMock.mockResolvedValue(taxContext);

    const response = await GET(new Request("http://localhost/api/reports/demo"));
    const body = await response.json();

    expect(loadSupabaseWorkspaceMock).toHaveBeenCalledWith(
      { kind: "request-client" },
      taxContext,
      { profile: "tax" },
    );
    expect(body).toEqual({ coretax: { package: "coretax" } });
    expect(buildDashboardMetricsMock).not.toHaveBeenCalled();
  });

  it("returns both independently authorized projections when both permissions are present", async () => {
    requireApiMembershipMock.mockResolvedValue(context(["reports:export", "tax:prepare"]));

    const response = await GET(new Request("http://localhost/api/reports/demo"));
    const body = await response.json();

    expect(body).toHaveProperty("dashboard");
    expect(body).toHaveProperty("coretax");
  });
});
