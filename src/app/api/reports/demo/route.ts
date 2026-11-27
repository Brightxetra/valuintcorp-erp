import { systemAccounts } from "@/lib/accounting/chart";
import { isApiResponse, requireApiMembership, withDemoHeader } from "@/lib/auth/api";
import { getDemoErpStore } from "@/lib/erp/demo-store";
import { loadSupabaseWorkspace } from "@/lib/erp/workspace-repository";
import { buildBalanceSheet, buildDashboardMetrics, buildIncomeStatement } from "@/lib/reports/reports";
import { prepareCoretaxPackage } from "@/lib/tax/coretax";
import { createRequestSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const context = await requireApiMembership(request);

  if (isApiResponse(context)) {
    return context;
  }

  const canExportReports = context.permissions.includes("reports:export");
  const canPrepareTax = context.permissions.includes("tax:prepare");

  if (!canExportReports && !canPrepareTax) {
    return withDemoHeader(
      Response.json(
        { error: "Akses laporan atau persiapan pajak diperlukan." },
        { status: 403, headers: { "cache-control": "no-store" } },
      ),
      context,
    );
  }

  const workspace = context.demoMode
    ? getDemoErpStore()
    : await loadSupabaseWorkspace(createRequestSupabaseClient(request), context, {
        profile: canExportReports ? "reports" : "tax",
      });

  const response: Record<string, unknown> = {};

  if (canExportReports) {
    response.business = {
      id: workspace.business.id,
      displayName: workspace.business.displayName,
      industry: workspace.business.industry,
      baseCurrency: workspace.business.baseCurrency,
    };
    response.period = workspace.period;
    response.dashboard = buildDashboardMetrics(workspace.journals, workspace.period, systemAccounts);
    response.incomeStatement = buildIncomeStatement(workspace.journals, workspace.period, systemAccounts);
    response.balanceSheet = buildBalanceSheet(workspace.journals, workspace.period, systemAccounts);
  }

  if (canPrepareTax) {
    response.coretax = prepareCoretaxPackage({
      business: workspace.business,
      taxProfile: workspace.taxProfile,
      entries: workspace.journals,
      accounts: systemAccounts,
      period: workspace.period,
    });
  }

  return withDemoHeader(
    Response.json(response, { headers: { "cache-control": "no-store" } }),
    context,
  );
}
