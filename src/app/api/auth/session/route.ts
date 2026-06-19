import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { z } from "zod";
import { serverAccessTokenCookie, serverBusinessCookie, serverRefreshTokenCookie, shouldUseDemoFallback } from "@/lib/auth/runtime";
import { accessTokenCookieMaxAge } from "@/lib/auth/token";
import { createServiceSupabaseClient, isSupabaseServiceConfigured } from "@/lib/supabase/service";

const syncSessionSchema = z.object({
  accessToken: z.string().min(20),
  refreshToken: z.string().min(20).optional(),
  businessId: z.string().uuid().optional(),
});

function cookieOptions(maxAge = 60 * 60) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

function createTokenSupabaseClient(accessToken: string) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export async function POST(request: Request) {
  if (shouldUseDemoFallback()) {
    return NextResponse.json({ demoMode: true }, { headers: { "cache-control": "no-store" } });
  }

  const payload = await request.json().catch(() => null);
  const parsed = syncSessionSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ errors: parsed.error.flatten() }, { status: 400, headers: { "cache-control": "no-store" } });
  }

  const supabase = createTokenSupabaseClient(parsed.data.accessToken);
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return NextResponse.json({ error: "Invalid or expired Supabase token." }, { status: 401, headers: { "cache-control": "no-store" } });
  }

  const membershipSupabase = isSupabaseServiceConfigured() ? createServiceSupabaseClient() : supabase;
  let defaultBusinessId = parsed.data.businessId ?? null;

  if (parsed.data.businessId) {
    const { data: membership, error: membershipError } = await membershipSupabase
      .from("business_members")
      .select("business_id")
      .eq("business_id", parsed.data.businessId)
      .eq("auth_user_id", userData.user.id)
      .maybeSingle();

    if (membershipError) {
      return NextResponse.json({ error: membershipError.message }, { status: 500, headers: { "cache-control": "no-store" } });
    }

    if (!membership?.business_id) {
      return NextResponse.json({ error: "User is not a member of this business." }, { status: 403, headers: { "cache-control": "no-store" } });
    }
  } else {
    const { data: membership, error: membershipError } = await membershipSupabase
      .from("business_members")
      .select("business_id")
      .eq("auth_user_id", userData.user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (membershipError) {
      return NextResponse.json({ error: membershipError.message }, { status: 500, headers: { "cache-control": "no-store" } });
    }

    defaultBusinessId = membership?.business_id ?? null;
  }

  const response = NextResponse.json(
    { ok: true, defaultBusinessId, hasBusiness: Boolean(defaultBusinessId) },
    { headers: { "cache-control": "no-store" } },
  );
  response.cookies.set(serverAccessTokenCookie, parsed.data.accessToken, cookieOptions(accessTokenCookieMaxAge(parsed.data.accessToken)));

  if (parsed.data.refreshToken) {
    response.cookies.set(serverRefreshTokenCookie, parsed.data.refreshToken, cookieOptions(60 * 60 * 24 * 30));
  }

  if (defaultBusinessId) {
    response.cookies.set(serverBusinessCookie, defaultBusinessId, cookieOptions(60 * 60 * 24 * 30));
  } else {
    response.cookies.set(serverBusinessCookie, "", cookieOptions(0));
  }

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  response.cookies.set(serverAccessTokenCookie, "", cookieOptions(0));
  response.cookies.set(serverRefreshTokenCookie, "", cookieOptions(0));
  response.cookies.set(serverBusinessCookie, "", cookieOptions(0));
  return response;
}
