import { isApiResponse, requireApiPermission, withDemoHeader } from "@/lib/auth/api";
import { getErpAttachmentsBucket } from "@/lib/supabase/config";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

const bucket = getErpAttachmentsBucket();

export async function GET(request: Request) {
  const context = await requireApiPermission(request, "hr:manage");
  if (isApiResponse(context)) return context;

  const employeeId = new URL(request.url).searchParams.get("employeeId")?.trim();
  if (!employeeId) {
    return withDemoHeader(Response.json({ error: "ID karyawan diperlukan." }, { status: 400 }), context);
  }
  if (context.demoMode) {
    return withDemoHeader(new Response(null, { status: 404 }), context);
  }

  const service = createServiceSupabaseClient();
  const { data: attachment, error } = await service
    .from("attachments")
    .select("storage_path, mime_type")
    .eq("business_id", context.businessId)
    .eq("owner_type", "employee")
    .eq("owner_id", employeeId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !attachment?.storage_path || !String(attachment.mime_type).startsWith("image/")) {
    return withDemoHeader(new Response(null, { status: 404 }), context);
  }

  const storagePath = String(attachment.storage_path);
  if (!storagePath.startsWith(`${context.businessId}/employee/${employeeId}/`)) {
    return withDemoHeader(new Response(null, { status: 404 }), context);
  }

  const { data: signed, error: signError } = await service.storage.from(bucket).createSignedUrl(storagePath, 300);
  if (signError || !signed) {
    return withDemoHeader(Response.json({ error: "Foto karyawan tidak dapat dibuka." }, { status: 422 }), context);
  }

  return withDemoHeader(Response.json({ url: signed.signedUrl }, {
    headers: { "cache-control": "private, no-store" },
  }), context);
}
