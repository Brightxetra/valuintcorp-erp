import { z } from "zod";
import { isApiResponse, requireApiPermission, withDemoHeader } from "@/lib/auth/api";
import { createRequestSupabaseClient } from "@/lib/supabase/server";

const bucket = process.env.SUPABASE_ERP_ATTACHMENTS_BUCKET || "erp-attachments";

const signedBusinessLogoUploadSchema = z.object({
  fileName: z.string().min(1),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]),
  sizeBytes: z.coerce.number().int().positive().max(2_000_000),
});

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function extensionFromFileName(fileName: string) {
  const extension = fileName.split(".").pop();
  return extension && extension !== fileName ? `.${extension.replace(/[^a-zA-Z0-9]/g, "")}` : "";
}

export async function POST(request: Request) {
  const context = await requireApiPermission(request, "business:update");

  if (isApiResponse(context)) return context;

  const payload = await request.json().catch(() => null);
  const parsed = signedBusinessLogoUploadSchema.safeParse(payload);

  if (!parsed.success) {
    return withDemoHeader(json({ errors: parsed.error.flatten() }, 400), context);
  }

  const storagePath = `${context.businessId}/business-logo/${crypto.randomUUID()}${extensionFromFileName(parsed.data.fileName)}`;

  if (context.demoMode) {
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

  const supabase = createRequestSupabaseClient(request);
  const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(storagePath);

  if (error) {
    return withDemoHeader(json({ error: error.message }, 422), context);
  }

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
