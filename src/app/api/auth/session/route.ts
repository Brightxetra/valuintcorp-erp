import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  serverAccessTokenCookie,
  serverBusinessCookie,
  serverLastActivityCookie,
  serverRefreshTokenCookie,
  serverSessionIdCookie,
  serverSessionRememberCookie,
  shouldUseDemoFallback,
} from "@/lib/auth/runtime";
import { accessTokenCookieMaxAge } from "@/lib/auth/token";
import { getLoginSessionStatus, revokeLoginSessionByToken, upsertLoginSession } from "@/lib/auth/login-sessions";
import {
  isIdleSessionExpired,
  nowSeconds,
  parseCookieHeader,
  rememberCookieValue,
  requestCookie,
  sessionCookieMaxAge,
  sessionCookieOptions,
  sessionEndedResponse,
} from "@/lib/auth/session-policy";
import { requireSupabasePublicConfig } from "@/lib/supabase/config";
import { createServiceSupabaseClient, isSupabaseServiceConfigured } from "@/lib/supabase/service";
import { acceptPendingMemberInvitesForUser } from "@/lib/auth/member-invites";

const optionalSessionTokenSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() ? value.trim() : undefined),
  z.string().min(1).optional(),
);

const syncSessionSchema = z.object({
  accessToken: z.string().trim().min(1),
  refreshToken: optionalSessionTokenSchema,
  businessId: z.string().uuid().optional(),
  rememberMe: z.boolean().optional(),
  freshLogin: z.boolean().optional(),
});

function setSessionCookies(
  response: NextResponse,
  params: {
    accessToken: string;
    refreshToken?: string;
    businessId: string | null;
    sessionToken: string;
    rememberMe: boolean;
  },
) {
  const maxAge = sessionCookieMaxAge(params.rememberMe);
  const accessMaxAge = Math.min(accessTokenCookieMaxAge(params.accessToken), maxAge);

  response.cookies.set(serverAccessTokenCookie, params.accessToken, sessionCookieOptions(accessMaxAge));

  if (params.refreshToken) {
    response.cookies.set(serverRefreshTokenCookie, params.refreshToken, sessionCookieOptions(maxAge));
  }

  response.cookies.set(serverSessionIdCookie, params.sessionToken, sessionCookieOptions(maxAge));
  response.cookies.set(serverSessionRememberCookie, rememberCookieValue(params.rememberMe), sessionCookieOptions(maxAge));
  response.cookies.set(serverLastActivityCookie, String(nowSeconds()), sessionCookieOptions(maxAge));

  if (params.businessId) {
    response.cookies.set(serverBusinessCookie, params.businessId, sessionCookieOptions(maxAge));
  } else {
    response.cookies.set(serverBusinessCookie, "", sessionCookieOptions(0));
  }
}

function createTokenSupabaseClient(accessToken: string) {
  const { url, anonKey } = requireSupabasePublicConfig("Supabase token client");
  return createClient(url, anonKey, {
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

  const serviceSupabase = isSupabaseServiceConfigured() ? createServiceSupabaseClient() : null;
  if (serviceSupabase && userData.user.email) {
    await acceptPendingMemberInvitesForUser(serviceSupabase, userData.user);
  }

  const membershipSupabase = serviceSupabase ?? supabase;
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
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const existingRememberMe = cookies.get(serverSessionRememberCookie) === "1";
  const rememberMe = parsed.data.rememberMe ?? existingRememberMe;
  const existingSessionToken = requestCookie(request, serverSessionIdCookie);
  const freshLogin = parsed.data.freshLogin === true;
  const lastActivity = Number(cookies.get(serverLastActivityCookie) ?? "");

  if (!freshLogin && isIdleSessionExpired(Number.isFinite(lastActivity) ? lastActivity : null, rememberMe)) {
    return sessionEndedResponse("session-expired");
  }

  if (!freshLogin && !existingSessionToken) {
    return sessionEndedResponse("session-expired");
  }

  if (existingSessionToken && !freshLogin) {
    const existingSessionStatus = await getLoginSessionStatus(existingSessionToken);

    if (existingSessionStatus === "revoked") {
      return sessionEndedResponse("session-revoked");
    }

    if (existingSessionStatus === "expired") {
      return sessionEndedResponse("session-expired");
    }
  }

  if (existingSessionToken && freshLogin) {
    await revokeLoginSessionByToken(existingSessionToken, userData.user.id, "superseded_login");
  }

  const sessionToken = freshLogin || !existingSessionToken ? crypto.randomUUID() : existingSessionToken;

  await upsertLoginSession({
    request,
    sessionToken,
    userId: userData.user.id,
    rememberMe,
  });

  setSessionCookies(response, {
    accessToken: parsed.data.accessToken,
    refreshToken: parsed.data.refreshToken,
    businessId: defaultBusinessId,
    sessionToken,
    rememberMe,
  });

  return response;
}

export async function DELETE(request: Request) {
  await revokeLoginSessionByToken(requestCookie(request, serverSessionIdCookie), null, "logout");

  const response = NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  response.cookies.set(serverAccessTokenCookie, "", sessionCookieOptions(0));
  response.cookies.set(serverRefreshTokenCookie, "", sessionCookieOptions(0));
  response.cookies.set(serverBusinessCookie, "", sessionCookieOptions(0));
  response.cookies.set(serverSessionIdCookie, "", sessionCookieOptions(0));
  response.cookies.set(serverSessionRememberCookie, "", sessionCookieOptions(0));
  response.cookies.set(serverLastActivityCookie, "", sessionCookieOptions(0));
  return response;
}
