import { isApiResponse, requireApiPermission, withDemoHeader } from "@/lib/auth/api";
import { createDemoStockAdjustment } from "@/lib/erp/demo-store";
import { createStockAdjustmentSchema } from "@/lib/erp/schemas";
import { loadSupabaseWorkspace } from "@/lib/erp/workspace-repository";
import { createRequestSupabaseClient } from "@/lib/supabase/server";

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const context = await requireApiPermission(request, "inventory:manage");

  if (isApiResponse(context)) {
    return context;
  }

  const payload = await request.json().catch(() => null);
  const parsed = createStockAdjustmentSchema.safeParse(payload);

  if (!parsed.success) {
    return withDemoHeader(json({ errors: parsed.error.flatten() }, 400), context);
  }

  if (context.demoMode) {
    try {
      return withDemoHeader(json({ workspace: createDemoStockAdjustment(parsed.data) }, 201), context);
    } catch (error) {
      return withDemoHeader(
        json({ error: error instanceof Error ? error.message : "Adjustment gagal dibuat." }, 422),
        context,
      );
    }
  }

  const supabase = createRequestSupabaseClient(request);
  const { error } = await supabase.rpc("post_stock_adjustment", {
    payload: { ...parsed.data, businessId: context.businessId },
  });

  if (error) {
    return withDemoHeader(json({ error: error.message }, 422), context);
  }

  try {
    return withDemoHeader(json({ workspace: await loadSupabaseWorkspace(supabase, context) }, 201), context);
  } catch (loadError) {
    return withDemoHeader(
      json({ error: loadError instanceof Error ? loadError.message : "Workspace gagal dimuat." }, 500),
      context,
    );
  }
}
