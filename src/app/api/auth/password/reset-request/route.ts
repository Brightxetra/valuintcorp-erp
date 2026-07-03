import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isApiResponse, requireAuthenticatedUser } from "@/lib/auth/api";
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

function resetRedirectUrl(request: Request) {
  return new URL("/auth/reset-password", request.url).toString();
}

export async function POST(request: Request) {
  const user = await requireAuthenticatedUser(request);

  if (isApiResponse(user)) return user;

  if (user.demoMode) {
    return json({ error: "Reset password demo fallback tidak tersedia karena Supabase production belum aktif." }, 409);
  }

  if (!user.userEmail) {
    return json({ error: "Email akun tidak tersedia untuk pengiriman link reset password." }, 422);
  }

  const supabase = createPasswordResetClient();
  const { error } = await supabase.auth.resetPasswordForEmail(user.userEmail, {
    redirectTo: resetRedirectUrl(request),
  });

  if (error) {
    return json({ error: error.message }, 422);
  }

  return json({ ok: true, email: user.userEmail });
}
