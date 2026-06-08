import { isApiResponse, requireApiPermission, withDemoHeader } from "@/lib/auth/api";
import { saveDemoLocation } from "@/lib/erp/demo-store";
import { locationSchema } from "@/lib/erp/schemas";
import { loadSupabaseWorkspace } from "@/lib/erp/workspace-repository";
import { createRequestSupabaseClient } from "@/lib/supabase/server";

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const context = await requireApiPermission(request, "business:update");

  if (isApiResponse(context)) return context;

  const payload = await request.json().catch(() => null);
  const parsed = locationSchema.safeParse(payload);

  if (!parsed.success) {
    return withDemoHeader(json({ errors: parsed.error.flatten() }, 400), context);
  }

  if (context.demoMode) {
    return withDemoHeader(json({ workspace: saveDemoLocation(parsed.data) }, 201), context);
  }

  const supabase = createRequestSupabaseClient(request);
  const { error } = await supabase.from("locations").insert({
    business_id: context.businessId,
    code: parsed.data.code,
    name: parsed.data.name,
    type: parsed.data.type,
    warehouse_id: parsed.data.warehouseId ?? null,
    is_active: parsed.data.isActive,
  });

  if (error) return withDemoHeader(json({ error: error.message }, 422), context);

  return withDemoHeader(json({ workspace: await loadSupabaseWorkspace(supabase, context) }, 201), context);
}
