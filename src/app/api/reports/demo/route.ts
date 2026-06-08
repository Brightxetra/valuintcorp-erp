import { systemAccounts } from "@/lib/accounting/chart";
import { isApiResponse, requireApiPermission, withDemoHeader } from "@/lib/auth/api";
import { getDemoErpStore } from "@/lib/erp/demo-store";
import { loadSupabaseWorkspace } from "@/lib/erp/workspace-repository";
import { buildBalanceSheet, buildDashboardMetrics, buildIncomeStatement } from "@/lib/reports/reports";
import { prepareCoretaxPackage } from "@/lib/tax/coretax";
import { createRequestSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const context = await requireApiPermission(request, "accounting:read");

  if (isApiResponse(context)) {
    return context;
  }

  const workspace = context.demoMode
    ? getDemoErpStore()
    : await loadSupabaseWorkspace(createRequestSupabaseClient(request), context);

  return withDemoHeader(
    Response.json(
      {
        business: workspace.business,
        period: workspace.period,
        dashboard: buildDashboardMetrics(workspace.journals, workspace.period, systemAccounts),
        incomeStatement: buildIncomeStatement(workspace.journals, workspace.period, systemAccounts),
        balanceSheet: buildBalanceSheet(workspace.journals, workspace.period, systemAccounts),
        coretax: prepareCoretaxPackage({
          business: workspace.business,
          taxProfile: workspace.taxProfile,
          entries: workspace.journals,
          accounts: systemAccounts,
          period: workspace.period,
        }),
      },
      { headers: { "cache-control": "no-store" } },
    ),
    context,
  );
}
