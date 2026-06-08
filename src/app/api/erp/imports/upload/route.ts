import { isApiResponse, requireApiPermission, withDemoHeader } from "@/lib/auth/api";
import { uploadDemoRawTransactions } from "@/lib/erp/demo-store";
import { uploadRawImportSchema } from "@/lib/erp/schemas";
import { loadSupabaseWorkspace } from "@/lib/erp/workspace-repository";
import { createRequestSupabaseClient } from "@/lib/supabase/server";

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const context = await requireApiPermission(request, "accounting:write");

  if (isApiResponse(context)) return context;

  const payload = await request.json().catch(() => null);
  const parsed = uploadRawImportSchema.safeParse(payload);

  if (!parsed.success) {
    return withDemoHeader(json({ errors: parsed.error.flatten() }, 400), context);
  }

  if (context.demoMode) {
    return withDemoHeader(json({ workspace: uploadDemoRawTransactions(parsed.data) }, 201), context);
  }

  const supabase = createRequestSupabaseClient(request);
  const { error } = await supabase.rpc("upload_raw_transactions", {
    payload: { ...parsed.data, businessId: context.businessId },
  });

  if (error) return withDemoHeader(json({ error: error.message }, 422), context);

  return withDemoHeader(json({ workspace: await loadSupabaseWorkspace(supabase, context) }, 201), context);
}
