import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { isApiResponse, requireAuthenticatedUser } from "@/lib/auth/api";
import { getErpAttachmentsBucket, requireSupabasePublicConfig } from "@/lib/supabase/config";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { logApiWarning } from "@/lib/observability/logger";

const schema = z.object({
  action: z.enum(["reset", "delete"]),
  businessId: z.string().uuid(),
  operationId: z.string().uuid(),
  password: z.string().min(1).max(1024),
  captchaToken: z.string().min(10).optional(),
});

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const user = await requireAuthenticatedUser(request);
  if (isApiResponse(user)) return user;
  if (user.demoMode || !user.userEmail) return json({ error: "Akun dengan password diperlukan untuk tindakan ini." }, 403);

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Isi password akun dan pilih perusahaan yang valid." }, 400);
  const { password, captchaToken, action, businessId, operationId } = parsed.data;
  if (process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY && !captchaToken) {
    return json({ error: "Selesaikan verifikasi hCaptcha terlebih dahulu." }, 400);
  }

  const { url, anonKey } = requireSupabasePublicConfig("Verifikasi password pemilik");
  const verifier = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: confirmation, error: authError } = await verifier.auth.signInWithPassword({
    email: user.userEmail,
    password,
    ...(captchaToken ? { options: { captchaToken } } : {}),
  });
  if (authError || !confirmation.session || confirmation.user?.id !== user.userId) {
    return json({ error: "Verifikasi password gagal. Periksa password dan verifikasi akun." }, 401);
  }
  await verifier.auth.signOut({ scope: "local" });

  const service = createServiceSupabaseClient();
  const { data, error } = await service.rpc("clear_company_data", {
    payload: { action, businessId, operationId, actorUserId: user.userId, storageBucket: getErpAttachmentsBucket() },
  });
  if (error) {
    if (error.code === "42501") return json({ error: error.message }, 403);
    if (error.code === "55P03" || error.code === "40P01") return json({ error: "Perusahaan sedang memproses transaksi. Coba lagi." }, 409);
    logApiWarning("company_data_operation_failed", { businessId, action, details: { code: error.code, message: error.message } });
    return json({ error: "Data perusahaan gagal diproses. Seluruh perubahan dibatalkan." }, 422);
  }

  const paths = data.paths as string[];
  const remaining: string[] = [];
  for (let offset = 0; offset < paths.length; offset += 100) {
    const batch = paths.slice(offset, offset + 100);
    const { error } = await service.storage.from(data.bucket as string).remove(batch);
    if (error) remaining.push(...batch);
  }
  if (paths.length) {
    const { error } = await service.from("company_data_operations").update({ storage_paths: remaining }).eq("id", operationId);
    if (remaining.length || error) {
      logApiWarning("company_data_storage_cleanup_pending", { businessId, action, details: { operationId, pending: remaining.length } });
    }
  }

  return json({ ok: true, storagePending: remaining.length > 0 });
}
