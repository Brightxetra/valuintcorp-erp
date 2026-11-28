import { isApiResponse, requireApiMembership, withDemoHeader } from "@/lib/auth/api";
import { getDemoErpStore } from "@/lib/erp/demo-store";
import { getErpAttachmentsBucket } from "@/lib/supabase/config";
import { createRequestSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

const bucket = getErpAttachmentsBucket();

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export async function GET(request: Request) {
  const context = await requireApiMembership(request);
  if (isApiResponse(context)) return context;

  const attachmentId = new URL(request.url).searchParams.get("id")?.trim();
  if (!attachmentId) {
    return withDemoHeader(json({ error: "Attachment id diperlukan." }, 400), context);
  }

  if (context.demoMode) {
    const attachment = getDemoErpStore().attachments.find((item) => item.id === attachmentId);
    if (!attachment) return withDemoHeader(json({ error: "Lampiran tidak ditemukan." }, 404), context);
    return withDemoHeader(json({ signedUrl: `/demo-upload/${attachment.storagePath}`, expiresIn: 300 }), context);
  }

  const { data: attachment, error: attachmentError } = await createRequestSupabaseClient(request)
    .from("attachments")
    .select("id, storage_path")
    .eq("business_id", context.businessId)
    .eq("id", attachmentId)
    .maybeSingle();

  if (attachmentError) {
    return withDemoHeader(json({ error: attachmentError.message }, 422), context);
  }
  if (!attachment?.storage_path) {
    return withDemoHeader(json({ error: "Lampiran tidak ditemukan atau tidak diizinkan." }, 404), context);
  }

  const storagePath = String(attachment.storage_path);
  if (!storagePath.startsWith(`${context.businessId}/`)) {
    return withDemoHeader(json({ error: "Path lampiran tidak sesuai tenant." }, 422), context);
  }

  const { data, error } = await createServiceSupabaseClient()
    .storage
    .from(bucket)
    .createSignedUrl(storagePath, 300);
  if (error) return withDemoHeader(json({ error: error.message }, 422), context);

  return withDemoHeader(json({ signedUrl: data.signedUrl, expiresIn: 300 }), context);
}
