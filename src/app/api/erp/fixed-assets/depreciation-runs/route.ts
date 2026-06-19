import { isApiResponse, requireApiPermission, withDemoHeader } from "@/lib/auth/api";
import { createDemoFixedAssetDepreciationRun } from "@/lib/erp/demo-store";
import { fixedAssetDepreciationRunSchema } from "@/lib/erp/schemas";
import { loadSupabaseWorkspace } from "@/lib/erp/workspace-repository";
import { callActorServiceRpc } from "@/lib/supabase/service-rpc";
import { createRequestSupabaseClient } from "@/lib/supabase/server";

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const context = await requireApiPermission(request, "accounting:write");

  if (isApiResponse(context)) {
    return context;
  }

  const payload = await request.json().catch(() => null);
  const parsed = fixedAssetDepreciationRunSchema.safeParse(payload);

  if (!parsed.success) {
    return withDemoHeader(json({ errors: parsed.error.flatten() }, 400), context);
  }

  if (context.demoMode) {
    try {
      return withDemoHeader(json({ workspace: createDemoFixedAssetDepreciationRun(parsed.data) }, 201), context);
    } catch (error) {
      return withDemoHeader(
        json({ error: error instanceof Error ? error.message : "Penyusutan gagal dipost." }, 422),
        context,
      );
    }
  }

  const supabase = createRequestSupabaseClient(request);
  const { error } = await callActorServiceRpc(
    "post_fixed_asset_depreciation_run",
    { ...parsed.data, businessId: context.businessId },
    context.userId,
  );

  if (error) {
    return withDemoHeader(json({ error: error.message }, 422), context);
  }

  return withDemoHeader(json({ workspace: await loadSupabaseWorkspace(supabase, context) }, 201), context);
}
