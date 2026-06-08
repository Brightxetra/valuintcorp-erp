import { isApiResponse, requireApiPermission, withDemoHeader } from "@/lib/auth/api";
import { postDemoDailySummary } from "@/lib/erp/demo-store";
import { summaryActionSchema } from "@/lib/erp/schemas";
import { loadSupabaseWorkspace } from "@/lib/erp/workspace-repository";
import { createRequestSupabaseClient } from "@/lib/supabase/server";

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const context = await requireApiPermission(request, "accounting:write");

  if (isApiResponse(context)) return context;

  const payload = await request.json().catch(() => null);
  const parsed = summaryActionSchema.safeParse(payload);

  if (!parsed.success) {
    return withDemoHeader(json({ errors: parsed.error.flatten() }, 400), context);
  }

  if (context.demoMode) {
    try {
      return withDemoHeader(json({ workspace: postDemoDailySummary(parsed.data) }), context);
    } catch (error) {
      return withDemoHeader(json({ error: error instanceof Error ? error.message : "Posting ringkasan gagal." }, 422), context);
    }
  }

  const supabase = createRequestSupabaseClient(request);
  const { error } = await supabase.rpc("post_daily_summary", {
    payload: { ...parsed.data, businessId: context.businessId },
  });

  if (error) return withDemoHeader(json({ error: error.message }, 422), context);

  return withDemoHeader(json({ workspace: await loadSupabaseWorkspace(supabase, context) }), context);
}
