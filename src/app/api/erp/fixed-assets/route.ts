import { isApiResponse, requireApiPermission, withDemoHeader } from "@/lib/auth/api";
import { getDemoErpStore, saveDemoFixedAsset } from "@/lib/erp/demo-store";
import { fixedAssetSchema, updateFixedAssetSchema } from "@/lib/erp/schemas";
import { loadSupabaseWorkspace } from "@/lib/erp/workspace-repository";
import { createRequestSupabaseClient } from "@/lib/supabase/server";

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export async function GET(request: Request) {
  const context = await requireApiPermission(request, "accounting:read");

  if (isApiResponse(context)) {
    return context;
  }

  const workspace = context.demoMode
    ? getDemoErpStore()
    : await loadSupabaseWorkspace(createRequestSupabaseClient(request), context);

  return withDemoHeader(
    json({
      fixedAssets: workspace.fixedAssets,
      fixedAssetDepreciationRuns: workspace.fixedAssetDepreciationRuns,
      fixedAssetDepreciationLines: workspace.fixedAssetDepreciationLines,
      fixedAssetDisposals: workspace.fixedAssetDisposals,
    }),
    context,
  );
}

export async function POST(request: Request) {
  const context = await requireApiPermission(request, "accounting:write");

  if (isApiResponse(context)) {
    return context;
  }

  const payload = await request.json().catch(() => null);
  const parsed = fixedAssetSchema.safeParse(payload);

  if (!parsed.success) {
    return withDemoHeader(json({ errors: parsed.error.flatten() }, 400), context);
  }

  if (context.demoMode) {
    try {
      return withDemoHeader(json({ workspace: saveDemoFixedAsset(parsed.data) }, 201), context);
    } catch (error) {
      return withDemoHeader(
        json({ error: error instanceof Error ? error.message : "Aset tetap gagal dibuat." }, 422),
        context,
      );
    }
  }

  const supabase = createRequestSupabaseClient(request);
  const { error } = await supabase.rpc("post_fixed_asset", {
    payload: { ...parsed.data, businessId: context.businessId },
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
  const parsed = updateFixedAssetSchema.safeParse(payload);

  if (!parsed.success) {
    return withDemoHeader(json({ errors: parsed.error.flatten() }, 400), context);
  }

  if (context.demoMode) {
    try {
      return withDemoHeader(json({ workspace: saveDemoFixedAsset(parsed.data) }), context);
    } catch (error) {
      return withDemoHeader(
        json({ error: error instanceof Error ? error.message : "Aset tetap gagal diperbarui." }, 422),
        context,
      );
    }
  }

  const supabase = createRequestSupabaseClient(request);
  const { error } = await supabase.rpc("update_fixed_asset", {
    payload: { ...parsed.data, businessId: context.businessId },
  });

  if (error) {
    return withDemoHeader(json({ error: error.message }, 422), context);
  }

  return withDemoHeader(json({ workspace: await loadSupabaseWorkspace(supabase, context) }), context);
}
