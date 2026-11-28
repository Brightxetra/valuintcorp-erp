import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isApiResponse, requireAuthenticatedUser } from "@/lib/auth/api";
import { passwordRecoveryPath } from "@/lib/auth/email-callback";
import { requireSupabasePublicConfig } from "@/lib/supabase/config";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

function createPasswordResetClient() {
  const { url, anonKey } = requireSupabasePublicConfig("Supabase password reset");

  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

const schema = z.object({ captchaToken: z.string().min(10).optional() });

export async function POST(request: Request) {
  const user = await requireAuthenticatedUser(request);

  if (isApiResponse(user)) return user;

  if (user.demoMode) {
    return json({ error: "Reset password demo fallback tidak tersedia karena Supabase production belum aktif." }, 409);
  }

  if (!user.userEmail) {
    return json({ error: "Email akun tidak tersedia untuk pengiriman link reset password." }, 422);
  }

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success || (process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY && !parsed.data.captchaToken)) {
    return json({ error: "Selesaikan verifikasi hCaptcha terlebih dahulu." }, 400);
  }

  const supabase = createPasswordResetClient();
  const { error } = await supabase.auth.resetPasswordForEmail(user.userEmail, {
    redirectTo: new URL(passwordRecoveryPath, request.url).toString(),
    ...(parsed.data.captchaToken ? { captchaToken: parsed.data.captchaToken } : {}),
  });

  if (error) {
    return json({ error: error.message }, 422);
  }

  return json({ ok: true, email: user.userEmail });
}
