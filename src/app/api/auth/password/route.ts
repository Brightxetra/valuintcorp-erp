import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isApiResponse, requireAuthenticatedUser } from "@/lib/auth/api";
import { revokeOtherLoginSessionsForUser } from "@/lib/auth/login-sessions";
import { passwordChangeSchema } from "@/lib/auth/password";
import { serverSessionIdCookie } from "@/lib/auth/runtime";
import { requestCookie } from "@/lib/auth/session-policy";
import { requireSupabasePublicConfig } from "@/lib/supabase/config";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

function createPasswordSupabaseClient() {
  const { url, anonKey } = requireSupabasePublicConfig("Supabase password change");

  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function POST(request: Request) {
  const user = await requireAuthenticatedUser(request);

  if (isApiResponse(user)) return user;

  if (user.demoMode) {
    return json({ error: "Password demo fallback tidak dapat diubah karena Supabase production belum aktif." }, 409);
  }

  if (!user.userEmail) {
    return json({ error: "Email akun tidak tersedia untuk verifikasi password." }, 422);
  }

  const payload = await request.json().catch(() => null);
  const parsed = passwordChangeSchema.safeParse(payload);

  if (!parsed.success) {
    return json({ errors: parsed.error.flatten() }, 400);
  }

  const supabase = createPasswordSupabaseClient();
  const { data: signedIn, error: signInError } = await supabase.auth.signInWithPassword({
    email: user.userEmail,
    password: parsed.data.currentPassword,
  });

  if (signInError || signedIn.user?.id !== user.userId || !signedIn.session?.access_token || !signedIn.session.refresh_token) {
    return json({ error: "Password lama tidak sesuai." }, 401);
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: parsed.data.newPassword,
  });

  if (updateError) {
    return json({ error: updateError.message }, 422);
  }

  await supabase.auth.signOut({ scope: "others" }).catch(() => undefined);

  const revokedOtherSessions = await revokeOtherLoginSessionsForUser(
    user.userId,
    requestCookie(request, serverSessionIdCookie),
  );

  return json({
    ok: true,
    revokedOtherSessions,
    session: {
      accessToken: signedIn.session.access_token,
      refreshToken: signedIn.session.refresh_token,
      userId: signedIn.user.id,
    },
  });
}
