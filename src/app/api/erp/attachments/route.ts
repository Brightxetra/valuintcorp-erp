import { isApiResponse, requireApiMembership, withDemoHeader } from "@/lib/auth/api";
import { createDemoAttachment } from "@/lib/erp/demo-store";
import { attachmentSchema } from "@/lib/erp/schemas";
import { loadSupabaseWorkspace } from "@/lib/erp/workspace-repository";
import { logApiError, logApiInfo } from "@/lib/observability/logger";
import { createRequestSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const context = await requireApiMembership(request);

  if (isApiResponse(context)) {
    return context;
  }

  const payload = await request.json().catch(() => null);
  const parsed = attachmentSchema.safeParse(payload);

  if (!parsed.success) {
    return withDemoHeader(json({ errors: parsed.error.flatten() }, 400), context);
  }

  const requiredPermission = parsed.data.ownerType === "payroll_run"
    ? "payroll:run"
    : parsed.data.ownerType === "employee"
      ? "hr:manage"
      : "accounting:write";
  if (!context.permissions.includes(requiredPermission)) {
    return withDemoHeader(
      json({ error: `Akses ${requiredPermission} diperlukan untuk lampiran ini.` }, 403),
      context,
    );
  }

  const expectedPathPrefix = `${context.businessId}/${parsed.data.ownerType}/${parsed.data.ownerId}/`;
  if (!parsed.data.storagePath.startsWith(expectedPathPrefix)) {
    return withDemoHeader(json({ error: "Path lampiran tidak sesuai tenant dan dokumen." }, 422), context);
  }

  if (context.demoMode) {
    logApiInfo("erp.attachment.metadata.demo", {
      businessId: context.businessId,
      userId: context.userId,
      route: "/api/erp/attachments",
      details: { ownerType: parsed.data.ownerType, fileName: parsed.data.fileName },
    });
    return withDemoHeader(json({ workspace: createDemoAttachment(parsed.data) }, 201), context);
  }

  const supabase = createRequestSupabaseClient(request);
  const ownerTable = {
    sales_invoice: "sales_invoices",
    purchase_bill: "purchase_bills",
    payment: "payments",
    payroll_run: "payroll_runs",
    fixed_asset: "fixed_assets",
    employee: "employees",
  }[parsed.data.ownerType];
  const { data: owner, error: ownerError } = await supabase
    .from(ownerTable)
    .select("id")
    .eq("business_id", context.businessId)
    .eq("id", parsed.data.ownerId)
    .maybeSingle();

  if (ownerError || !owner?.id) {
    return withDemoHeader(
      json({ error: ownerError?.message ?? "Dokumen lampiran tidak ditemukan atau tidak diizinkan." }, 404),
      context,
    );
  }

  const service = createServiceSupabaseClient();
  const { data: inserted, error } = await service.from("attachments").insert({
    business_id: context.businessId,
    owner_type: parsed.data.ownerType,
    owner_id: parsed.data.ownerId,
    file_name: parsed.data.fileName,
    storage_path: parsed.data.storagePath,
    mime_type: parsed.data.mimeType,
    size_bytes: parsed.data.sizeBytes,
    created_by: context.userId,
  }).select("id").single();

  if (error) {
    logApiError("erp.attachment.metadata.failed", error, {
      businessId: context.businessId,
      userId: context.userId,
      route: "/api/erp/attachments",
      details: { ownerType: parsed.data.ownerType, ownerId: parsed.data.ownerId },
    });
    return withDemoHeader(json({ error: error.message }, 422), context);
  }

  if (parsed.data.ownerType === "employee" && inserted?.id) {
    const { data: previousPhotos } = await service
      .from("attachments")
      .select("id, storage_path")
      .eq("business_id", context.businessId)
      .eq("owner_type", "employee")
      .eq("owner_id", parsed.data.ownerId)
      .neq("id", inserted.id);
    const previousIds = (previousPhotos ?? []).map((item) => String(item.id));
    const previousPaths = (previousPhotos ?? []).map((item) => String(item.storage_path));
    const { error: removeError } = previousPaths.length
      ? await service.storage.from(process.env.SUPABASE_ERP_ATTACHMENTS_BUCKET || "erp-attachments").remove(previousPaths)
      : { error: null };

    if (!removeError && previousIds.length) {
      await service.from("attachments").delete().eq("business_id", context.businessId).in("id", previousIds);
    }
  }

  logApiInfo("erp.attachment.metadata.created", {
    businessId: context.businessId,
    userId: context.userId,
    route: "/api/erp/attachments",
    details: { ownerType: parsed.data.ownerType, fileName: parsed.data.fileName },
  });

  return withDemoHeader(json({ workspace: await loadSupabaseWorkspace(supabase, context) }, 201), context);
}
