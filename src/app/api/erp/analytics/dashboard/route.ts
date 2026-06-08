import { isApiResponse, requireApiPermission, withDemoHeader } from "@/lib/auth/api";
import { getDemoErpStore } from "@/lib/erp/demo-store";
import { loadSupabaseWorkspace } from "@/lib/erp/workspace-repository";
import { createRequestSupabaseClient } from "@/lib/supabase/server";

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function boundedDashboard(workspace: Awaited<ReturnType<typeof loadSupabaseWorkspace>>, locationId?: string | null) {
  const summaries = locationId
    ? workspace.dailyTransactionSummaries.filter((summary) => summary.locationId === locationId)
    : workspace.dailyTransactionSummaries;

  return {
    business: workspace.business,
    period: workspace.period,
    metrics: workspace.metrics,
    locationMetrics: locationId
      ? workspace.locationMetrics.filter((metric) => metric.locationId === locationId)
      : workspace.locationMetrics,
    summaries: summaries.slice(0, 50),
    importBatches: workspace.rawImportBatches.slice(0, 25),
    tasks: workspace.tasks.slice(0, 20),
  };
}

export async function GET(request: Request) {
  const context = await requireApiPermission(request, "business:read");

  if (isApiResponse(context)) return context;

  const locationId = new URL(request.url).searchParams.get("locationId");

  if (context.demoMode) {
    return withDemoHeader(json({ dashboard: boundedDashboard(getDemoErpStore(), locationId) }), context);
  }

  const supabase = createRequestSupabaseClient(request);
  return withDemoHeader(json({ dashboard: boundedDashboard(await loadSupabaseWorkspace(supabase, context), locationId) }), context);
}
