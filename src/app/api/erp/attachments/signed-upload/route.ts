import { isApiResponse, requireApiMembership, withDemoHeader } from "@/lib/auth/api";
import { signedAttachmentUploadSchema } from "@/lib/erp/schemas";
import { logApiError, logApiInfo, logApiWarning } from "@/lib/observability/logger";
import { getErpAttachmentsBucket } from "@/lib/supabase/config";
import { createRequestSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

const bucket = getErpAttachmentsBucket();

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function extensionFromFileName(fileName: string) {
  const extension = fileName.split(".").pop();
  return extension && extension !== fileName ? `.${extension.replace(/[^a-zA-Z0-9]/g, "")}` : "";
}

function tableForOwner(ownerType: string) {
  return {
    sales_invoice: "sales_invoices",
    purchase_bill: "purchase_bills",
    payment: "payments",
    payroll_run: "payroll_runs",
    fixed_asset: "fixed_assets",
    employee: "employees",
  }[ownerType];
}

export async function POST(request: Request) {
  const context = await requireApiMembership(request);

  if (isApiResponse(context)) return context;

  const payload = await request.json().catch(() => null);
  const parsed = signedAttachmentUploadSchema.safeParse(payload);

  if (!parsed.success) {
    return withDemoHeader(json({ errors: parsed.error.flatten() }, 400), context);
  }

  if (parsed.data.ownerType === "employee" && (
    !["image/jpeg", "image/png", "image/webp"].includes(parsed.data.mimeType)
    || parsed.data.sizeBytes > 5_000_000
  )) {
    return withDemoHeader(json({ error: "Foto harus JPG, PNG, atau WebP dan maksimal 5 MB." }, 400), context);
  }

  const requiredPermission = parsed.data.ownerType === "payroll_run"
    ? "payroll:run"
    : parsed.data.ownerType === "employee"
      ? "hr:manage"
      : "accounting:write";
  if (!context.permissions.includes(requiredPermission)) {
    return withDemoHeader(
      json({ error: `Akses ${requiredPermission} diperlukan untuk upload lampiran ini.` }, 403),
      context,
    );
  }

  const storagePath = `${context.businessId}/${parsed.data.ownerType}/${parsed.data.ownerId}/${crypto.randomUUID()}${extensionFromFileName(parsed.data.fileName)}`;

  if (context.demoMode) {
    logApiInfo("erp.attachment.signed_upload.demo", {
      businessId: context.businessId,
      userId: context.userId,
      route: "/api/erp/attachments/signed-upload",
      details: { ownerType: parsed.data.ownerType, sizeBytes: parsed.data.sizeBytes },
    });
    return withDemoHeader(
      json({
        bucket,
        storagePath,
        signedUrl: `/demo-upload/${storagePath}`,
        uploadToken: "demo-token",
        token: "demo-token",
      }),
      context,
    );
  }

  const table = tableForOwner(parsed.data.ownerType);

  if (!table) {
    return withDemoHeader(json({ error: "Owner attachment tidak valid." }, 400), context);
  }

  const supabase = createRequestSupabaseClient(request);
  const { data: owner, error: ownerError } = await supabase
    .from(table)
    .select("id")
    .eq("business_id", context.businessId)
    .eq("id", parsed.data.ownerId)
    .maybeSingle();

  if (ownerError) {
    logApiError("erp.attachment.owner_lookup.failed", ownerError, {
      businessId: context.businessId,
      userId: context.userId,
      route: "/api/erp/attachments/signed-upload",
      details: { ownerType: parsed.data.ownerType, ownerId: parsed.data.ownerId },
    });
    return withDemoHeader(json({ error: ownerError.message }, 422), context);
  }
  if (!owner?.id) {
    logApiWarning("erp.attachment.owner_lookup.not_found", {
      businessId: context.businessId,
      userId: context.userId,
      route: "/api/erp/attachments/signed-upload",
      details: { ownerType: parsed.data.ownerType, ownerId: parsed.data.ownerId },
    });
    return withDemoHeader(json({ error: "Dokumen pemilik attachment tidak ditemukan di tenant ini." }, 404), context);
  }

  const { data, error } = await createServiceSupabaseClient()
    .storage
    .from(bucket)
    .createSignedUploadUrl(storagePath);

  if (error) {
    logApiError("erp.attachment.signed_upload.failed", error, {
      businessId: context.businessId,
      userId: context.userId,
      route: "/api/erp/attachments/signed-upload",
      details: { bucket, storagePath },
    });
    const message = parsed.data.ownerType === "employee"
      ? "Penyimpanan foto karyawan tidak dapat diakses. Coba lagi."
      : error.message;
    return withDemoHeader(json({ error: message }, 422), context);
  }

  logApiInfo("erp.attachment.signed_upload.created", {
    businessId: context.businessId,
    userId: context.userId,
    route: "/api/erp/attachments/signed-upload",
    details: { bucket, storagePath, sizeBytes: parsed.data.sizeBytes },
  });

  return withDemoHeader(
    json({
      bucket,
      storagePath,
      signedUrl: data.signedUrl,
      uploadToken: data.token,
      token: data.token,
    }),
    context,
  );
}
