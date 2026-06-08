import { isApiResponse, requireApiPermission, withDemoHeader } from "@/lib/auth/api";
import { createRequestSupabaseClient } from "@/lib/supabase/server";

const bucket = process.env.SUPABASE_ERP_ATTACHMENTS_BUCKET || "erp-attachments";

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export async function GET(request: Request) {
  const context = await requireApiPermission(request, "business:read");

  if (isApiResponse(context)) return context;

  const url = new URL(request.url);
  const storagePath = url.searchParams.get("path") ?? "";

  if (!storagePath) {
    return withDemoHeader(json({ signedUrl: null }), context);
  }

  if (storagePath.startsWith("data:") || storagePath.startsWith("http://") || storagePath.startsWith("https://")) {
    return withDemoHeader(json({ signedUrl: storagePath }), context);
  }

  if (!storagePath.startsWith(`${context.businessId}/business-logo/`)) {
    return withDemoHeader(json({ error: "Logo bisnis tidak berasal dari tenant aktif." }, 403), context);
  }

  if (context.demoMode) {
    return withDemoHeader(json({ signedUrl: `/demo-upload/${storagePath}` }), context);
  }

  const supabase = createRequestSupabaseClient(request);
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(storagePath, 60 * 60);

  if (error) {
    return withDemoHeader(json({ error: error.message }, 422), context);
  }

  return withDemoHeader(json({ signedUrl: data.signedUrl }), context);
}
