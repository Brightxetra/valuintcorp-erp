import { isApiResponse, requireApiPermission, withDemoHeader } from "@/lib/auth/api";
import { runDemoMrp } from "@/lib/erp/demo-store";
import { buildMrpRecommendations } from "@/lib/erp/industry-workflows";
import { mrpRunSchema } from "@/lib/erp/schemas";
import { loadSupabaseWorkspace } from "@/lib/erp/workspace-repository";
import { createRequestSupabaseClient } from "@/lib/supabase/server";

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const context = await requireApiPermission(request, "inventory:manage");
  if (isApiResponse(context)) return context;

  const parsed = mrpRunSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return withDemoHeader(json({ errors: parsed.error.flatten() }, 400), context);

  if (context.demoMode) {
    return withDemoHeader(json({ workspace: runDemoMrp(parsed.data) }, 201), context);
  }

  const supabase = createRequestSupabaseClient(request);
  const workspace = await loadSupabaseWorkspace(supabase, context, { profile: "inventory" });
  const nowIso = new Date().toISOString();
  const forecastRows = parsed.data.forecasts.map((forecast) => ({
    business_id: context.businessId,
    product_id: forecast.productId,
    location_id: forecast.locationId ?? null,
    period_start: forecast.periodStart,
    period_end: forecast.periodEnd,
    quantity: forecast.quantity,
    source: forecast.source,
    notes: forecast.notes ?? null,
  }));

  if (forecastRows.length > 0) {
    const forecastInsert = await supabase.from("demand_forecasts").insert(forecastRows);
    if (forecastInsert.error) return withDemoHeader(json({ error: forecastInsert.error.message }, 422), context);
  }

  const runResult = await supabase
    .from("mrp_runs")
    .insert({
      business_id: context.businessId,
      name: parsed.data.name,
      period_start: parsed.data.periodStart,
      period_end: parsed.data.periodEnd,
      status: "planned",
      created_by: context.userId,
    })
    .select("id")
    .single();

  if (runResult.error || !runResult.data?.id) {
    return withDemoHeader(json({ error: runResult.error?.message ?? "MRP run tidak dapat dibuat." }, 422), context);
  }

  const manualForecasts = parsed.data.forecasts.map((forecast) => ({
    productId: forecast.productId,
    quantity: forecast.quantity,
    periodEnd: forecast.periodEnd,
  }));
  const activeForecasts = workspace.demandForecasts
    .filter((forecast) => forecast.periodStart <= parsed.data.periodEnd && forecast.periodEnd >= parsed.data.periodStart)
    .map((forecast) => ({
      productId: forecast.productId,
      quantity: forecast.quantity,
      periodEnd: forecast.periodEnd,
    }));
  const recommendations = buildMrpRecommendations({
    businessId: context.businessId,
    periodEnd: parsed.data.periodEnd,
    products: workspace.products,
    structures: workspace.productStructures,
    stockMovements: workspace.stockMovements,
    forecasts: [...activeForecasts, ...manualForecasts],
    mrpRunId: String(runResult.data.id),
    nowIso,
  });

  if (recommendations.length > 0) {
    const recommendationInsert = await supabase.from("mrp_recommendations").insert(
      recommendations.map((recommendation) => ({
        business_id: context.businessId,
        mrp_run_id: runResult.data.id,
        product_id: recommendation.productId,
        type: recommendation.type,
        quantity: recommendation.quantity,
        due_date: recommendation.dueDate,
        source_demand: recommendation.sourceDemand ?? null,
        status: recommendation.status,
      })),
    );

    if (recommendationInsert.error) {
      return withDemoHeader(json({ error: recommendationInsert.error.message }, 422), context);
    }
  }

  return withDemoHeader(json({ workspace: await loadSupabaseWorkspace(supabase, context, { profile: "inventory" }) }, 201), context);
}
