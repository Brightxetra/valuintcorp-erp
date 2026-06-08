import { isApiResponse, requireApiPermission, withDemoHeader } from "@/lib/auth/api";
import { createDemoAttachment } from "@/lib/erp/demo-store";
import { attachmentSchema } from "@/lib/erp/schemas";
import { loadSupabaseWorkspace } from "@/lib/erp/workspace-repository";
import { logApiError, logApiInfo } from "@/lib/observability/logger";
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
  const parsed = attachmentSchema.safeParse(payload);

  if (!parsed.success) {
    return withDemoHeader(json({ errors: parsed.error.flatten() }, 400), context);
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
  const { error } = await supabase.from("attachments").insert({
    business_id: context.businessId,
    owner_type: parsed.data.ownerType,
    owner_id: parsed.data.ownerId,
    file_name: parsed.data.fileName,
    storage_path: parsed.data.storagePath,
    mime_type: parsed.data.mimeType,
    size_bytes: parsed.data.sizeBytes,
    created_by: context.userId,
  });

  if (error) {
    logApiError("erp.attachment.metadata.failed", error, {
      businessId: context.businessId,
      userId: context.userId,
      route: "/api/erp/attachments",
      details: { ownerType: parsed.data.ownerType, ownerId: parsed.data.ownerId },
    });
    return withDemoHeader(json({ error: error.message }, 422), context);
  }

  logApiInfo("erp.attachment.metadata.created", {
    businessId: context.businessId,
    userId: context.userId,
    route: "/api/erp/attachments",
    details: { ownerType: parsed.data.ownerType, fileName: parsed.data.fileName },
  });

  return withDemoHeader(json({ workspace: await loadSupabaseWorkspace(supabase, context) }, 201), context);
}
