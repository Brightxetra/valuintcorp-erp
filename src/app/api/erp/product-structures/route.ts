import { isApiResponse, requireApiPermission, withDemoHeader } from "@/lib/auth/api";
import { saveDemoProductStructure } from "@/lib/erp/demo-store";
import { productStructureSchema } from "@/lib/erp/schemas";
import { loadSupabaseWorkspace } from "@/lib/erp/workspace-repository";
import { createRequestSupabaseClient } from "@/lib/supabase/server";

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const context = await requireApiPermission(request, "inventory:manage");
  if (isApiResponse(context)) return context;

  const parsed = productStructureSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return withDemoHeader(json({ errors: parsed.error.flatten() }, 400), context);

  if (context.demoMode) {
    return withDemoHeader(json({ workspace: saveDemoProductStructure(parsed.data) }, parsed.data.id ? 200 : 201), context);
  }

  const supabase = createRequestSupabaseClient(request);

  if (parsed.data.isActive) {
    const deactivate = await supabase
      .from("product_structures")
      .update({ is_active: false })
      .eq("business_id", context.businessId)
      .eq("parent_product_id", parsed.data.parentProductId)
      .eq("type", parsed.data.type)
      .neq("id", parsed.data.id ?? "00000000-0000-0000-0000-000000000000");

    if (deactivate.error) return withDemoHeader(json({ error: deactivate.error.message }, 422), context);
  }

  const structurePayload = {
    business_id: context.businessId,
    parent_product_id: parsed.data.parentProductId,
    type: parsed.data.type,
    output_quantity: parsed.data.outputQuantity,
    yield_percent: parsed.data.yieldPercent,
    is_active: parsed.data.isActive,
    notes: parsed.data.notes ?? null,
    updated_at: new Date().toISOString(),
  };

  const structureResult = parsed.data.id
    ? await supabase
        .from("product_structures")
        .update(structurePayload)
        .eq("business_id", context.businessId)
        .eq("id", parsed.data.id)
        .select("id")
        .single()
    : await supabase
        .from("product_structures")
        .insert(structurePayload)
        .select("id")
        .single();

  if (structureResult.error || !structureResult.data?.id) {
    return withDemoHeader(json({ error: structureResult.error?.message ?? "Resep/BOM tidak dapat disimpan." }, 422), context);
  }

  const structureId = String(structureResult.data.id);
  const deleteLines = await supabase
    .from("product_structure_lines")
    .delete()
    .eq("business_id", context.businessId)
    .eq("structure_id", structureId);

  if (deleteLines.error) return withDemoHeader(json({ error: deleteLines.error.message }, 422), context);

  const insertLines = await supabase.from("product_structure_lines").insert(
    parsed.data.lines.map((line) => ({
      business_id: context.businessId,
      structure_id: structureId,
      component_product_id: line.componentProductId,
      quantity: line.quantity,
      waste_percent: line.wastePercent,
      unit_cost_snapshot: line.unitCostSnapshot,
      notes: line.notes ?? null,
    })),
  );

  if (insertLines.error) return withDemoHeader(json({ error: insertLines.error.message }, 422), context);

  return withDemoHeader(
    json({ workspace: await loadSupabaseWorkspace(supabase, context, { profile: "inventory" }) }, parsed.data.id ? 200 : 201),
    context,
  );
}
