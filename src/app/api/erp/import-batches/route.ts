import { z } from "zod";
import { isApiResponse, requireApiPermission, withDemoHeader } from "@/lib/auth/api";
import { createDemoImportBatch, updateDemoImportBatch } from "@/lib/erp/demo-store";
import { importBatchSchema } from "@/lib/erp/schemas";
import { loadSupabaseWorkspace } from "@/lib/erp/workspace-repository";
import { createRequestSupabaseClient } from "@/lib/supabase/server";

const updateImportSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["committed", "rolled_back"]),
});

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const context = await requireApiPermission(request, "accounting:write");

  if (isApiResponse(context)) {
    return context;
  }

  const payload = await request.json().catch(() => null);
  const parsed = importBatchSchema.safeParse(payload);

  if (!parsed.success) {
    return withDemoHeader(json({ errors: parsed.error.flatten() }, 400), context);
  }

  if (context.demoMode) {
    return withDemoHeader(json({ workspace: createDemoImportBatch(parsed.data) }, 201), context);
  }

  const supabase = createRequestSupabaseClient(request);
  const { error } = await supabase.from("import_batches").insert({
    business_id: context.businessId,
    source: parsed.data.source,
    status: "preview",
    total_rows: parsed.data.totalRows,
    valid_rows: parsed.data.validRows,
    duplicate_rows: parsed.data.duplicateRows,
    error_rows: parsed.data.errorRows,
    created_by: context.userId,
  });

  if (error) {
    return withDemoHeader(json({ error: error.message }, 422), context);
  }

  return withDemoHeader(json({ workspace: await loadSupabaseWorkspace(supabase, context) }, 201), context);
}

export async function PATCH(request: Request) {
  const context = await requireApiPermission(request, "accounting:write");

  if (isApiResponse(context)) {
    return context;
  }

  const payload = await request.json().catch(() => null);
  const parsed = updateImportSchema.safeParse(payload);

  if (!parsed.success) {
    return withDemoHeader(json({ errors: parsed.error.flatten() }, 400), context);
  }

  if (context.demoMode) {
    return withDemoHeader(json({ workspace: updateDemoImportBatch(parsed.data.id, parsed.data.status) }), context);
  }

  const supabase = createRequestSupabaseClient(request);
  const { error } = await supabase
    .from("import_batches")
    .update({ status: parsed.data.status })
    .eq("business_id", context.businessId)
    .eq("id", parsed.data.id)
    .eq("status", "preview");

  if (error) {
    return withDemoHeader(json({ error: error.message }, 422), context);
  }

  return withDemoHeader(json({ workspace: await loadSupabaseWorkspace(supabase, context) }), context);
}
