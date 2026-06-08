import { isApiResponse, requireApiPermission, withDemoHeader } from "@/lib/auth/api";
import { uploadDemoRawTransactions } from "@/lib/erp/demo-store";
import { buildRawImportPreview } from "@/lib/erp/import-preview";
import { csvImportSchema } from "@/lib/erp/schemas";
import { loadSupabaseWorkspace } from "@/lib/erp/workspace-repository";
import { logApiError, logApiInfo, logApiWarning } from "@/lib/observability/logger";
import { createRequestSupabaseClient } from "@/lib/supabase/server";

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const context = await requireApiPermission(request, "accounting:write");

  if (isApiResponse(context)) return context;

  const payload = await request.json().catch(() => null);
  const parsed = csvImportSchema.safeParse(payload);

  if (!parsed.success) {
    return withDemoHeader(json({ errors: parsed.error.flatten() }, 400), context);
  }

  const preview = buildRawImportPreview({ ...parsed.data, businessId: context.businessId });

  if (preview.validRows === 0) {
    logApiWarning("erp.import.commit.no_valid_rows", {
      businessId: context.businessId,
      userId: context.userId,
      route: "/api/erp/imports/commit",
      details: { source: parsed.data.source, locationId: parsed.data.locationId, totalRows: preview.totalRows },
    });
    return withDemoHeader(json({ error: "CSV tidak memiliki row valid untuk commit.", preview }, 422), context);
  }

  const importPayload = {
    locationId: parsed.data.locationId,
    source: parsed.data.source,
    transactions: preview.transactions,
  };

  if (context.demoMode) {
    logApiInfo("erp.import.commit.demo", {
      businessId: context.businessId,
      userId: context.userId,
      route: "/api/erp/imports/commit",
      details: { source: parsed.data.source, validRows: preview.validRows },
    });
    return withDemoHeader(json({ preview, workspace: uploadDemoRawTransactions(importPayload) }, 201), context);
  }

  const supabase = createRequestSupabaseClient(request);
  const { error } = await supabase.rpc("upload_raw_transactions", {
    payload: { ...importPayload, businessId: context.businessId },
  });

  if (error) {
    logApiError("erp.import.commit.failed", error, {
      businessId: context.businessId,
      userId: context.userId,
      route: "/api/erp/imports/commit",
      details: { source: parsed.data.source, validRows: preview.validRows },
    });
    return withDemoHeader(json({ error: error.message, preview }, 422), context);
  }

  logApiInfo("erp.import.commit.succeeded", {
    businessId: context.businessId,
    userId: context.userId,
    route: "/api/erp/imports/commit",
    details: { source: parsed.data.source, validRows: preview.validRows },
  });

  return withDemoHeader(json({ preview, workspace: await loadSupabaseWorkspace(supabase, context) }, 201), context);
}
