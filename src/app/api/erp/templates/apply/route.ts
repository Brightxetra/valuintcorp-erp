import { isApiResponse, requireApiPermission, withDemoHeader } from "@/lib/auth/api";
import { applyDemoIndustryTemplate } from "@/lib/erp/demo-store";
import { applyIndustryTemplateSchema } from "@/lib/erp/schemas";
import { loadSupabaseWorkspace } from "@/lib/erp/workspace-repository";
import { callActorServiceRpc } from "@/lib/supabase/service-rpc";
import { createRequestSupabaseClient } from "@/lib/supabase/server";

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const context = await requireApiPermission(request, "business:update");

  if (isApiResponse(context)) return context;

  const payload = await request.json().catch(() => null);
  const parsed = applyIndustryTemplateSchema.safeParse(payload);

  if (!parsed.success) {
    return withDemoHeader(json({ errors: parsed.error.flatten() }, 400), context);
  }

  if (context.demoMode) {
    return withDemoHeader(json({ workspace: applyDemoIndustryTemplate(parsed.data) }), context);
  }

  const supabase = createRequestSupabaseClient(request);
  const { error } = await callActorServiceRpc(
    "apply_industry_template",
    { ...parsed.data, businessId: context.businessId },
    context.userId,
  );

  if (error) return withDemoHeader(json({ error: error.message }, 422), context);

  return withDemoHeader(json({ workspace: await loadSupabaseWorkspace(supabase, context) }), context);
}
