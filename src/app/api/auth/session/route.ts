import { NextResponse } from "next/server";
import { z } from "zod";
import type { BusinessRole } from "@/lib/domain/types";
import {
  serverAccessTokenCookie,
  serverBusinessCookie,
  serverLastActivityCookie,
  serverRefreshTokenCookie,
  serverSessionIdCookie,
  serverSessionRememberCookie,
  isSupabaseEnvConfigured,
  shouldUseDemoFallback,
} from "@/lib/auth/runtime";
import { authenticationConfigurationUnavailableResponse } from "@/lib/auth/configuration-response";
import { accessTokenCookieMaxAge } from "@/lib/auth/token";
import {
  createLoginSession,
  getLoginSessionBinding,
  getLoginSessionBySupabaseSession,
  revokeLoginSessionByToken,
  revokeOtherLoginSessionsForUser,
  touchLoginSession,
} from "@/lib/auth/login-sessions";
import { isPasswordRecoveryAuthentication, isRecentSupabaseAuthentication } from "@/lib/auth/token";
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
import { createServiceSupabaseClient, isSupabaseServiceConfigured } from "@/lib/supabase/service";
import { acceptPendingMemberInvitesForUser } from "@/lib/auth/member-invites";
import { landingPathForPermissions, permissionsForMember, type Permission } from "@/lib/security/permissions";
import { verifySupabaseAccessToken } from "@/lib/auth/verified-session";

const optionalSessionTokenSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() ? value.trim() : undefined),
  z.string().min(1).optional(),
);

const syncSessionSchema = z.object({
  accessToken: z.string().trim().min(1),
  refreshToken: optionalSessionTokenSchema,
  businessId: z.string().uuid().optional(),
  rememberMe: z.boolean().optional(),
  passwordResetCompleted: z.boolean().optional(),
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

function sessionRegistryUnavailableResponse() {
  return NextResponse.json(
    { error: "Session registry is temporarily unavailable." },
    { status: 503, headers: { "cache-control": "no-store" } },
  );
}

function permissionsForSessionMembership(membership: {
  role?: string | null;
  access_scope?: string | null;
  access_permissions?: unknown;
}) {
  return permissionsForMember(
    (membership.role ?? "staff") as BusinessRole,
    membership.access_scope === "custom" ? "custom" : "role",
    Array.isArray(membership.access_permissions)
      ? membership.access_permissions.filter((permission): permission is Permission => typeof permission === "string")
      : [],
  );
}

function defaultMembershipPath(membership: Parameters<typeof permissionsForSessionMembership>[0]) {
  const path = landingPathForPermissions(permissionsForSessionMembership(membership));
  return path === "/dashboard" ? null : path;
}

export async function POST(request: Request) {
  if (shouldUseDemoFallback()) {
    return NextResponse.json({ demoMode: true }, { headers: { "cache-control": "no-store" } });
  }

  if (!isSupabaseEnvConfigured()) {
    return authenticationConfigurationUnavailableResponse();
  }

  const payload = await request.json().catch(() => null);
  const parsed = syncSessionSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ errors: parsed.error.flatten() }, { status: 400, headers: { "cache-control": "no-store" } });
  }

  const verifiedSession = await verifySupabaseAccessToken(parsed.data.accessToken);
  if (!verifiedSession) {
    return NextResponse.json({ error: "Invalid or expired Supabase token." }, { status: 401, headers: { "cache-control": "no-store" } });
  }

  const serviceSupabase = isSupabaseServiceConfigured() ? createServiceSupabaseClient() : null;
  if (!serviceSupabase) return sessionRegistryUnavailableResponse();

  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const existingRememberMe = cookies.get(serverSessionRememberCookie) === "1";
  const rememberMe = parsed.data.rememberMe ?? existingRememberMe;
  const existingSessionToken = requestCookie(request, serverSessionIdCookie);
  const existingBinding = await getLoginSessionBinding(existingSessionToken);
  const matchesVerifiedSession =
    existingBinding.state === "active" &&
    existingBinding.userId === verifiedSession.identity.userId &&
    existingBinding.supabaseSessionId === verifiedSession.identity.sessionId;
  const lastActivity = Number(cookies.get(serverLastActivityCookie) ?? "");
  let sessionToken: string;

  if (matchesVerifiedSession) {
    if (isIdleSessionExpired(Number.isFinite(lastActivity) ? lastActivity : null, rememberMe)) {
      return sessionEndedResponse("session-expired");
    }

    const touched = await touchLoginSession({
      request,
      sessionToken: existingSessionToken,
      userId: verifiedSession.identity.userId,
      supabaseSessionId: verifiedSession.identity.sessionId,
      rememberMe,
    });
    if (!touched || !existingSessionToken) return sessionRegistryUnavailableResponse();
    sessionToken = existingSessionToken;
  } else {
    if (existingBinding.state === "unavailable") return sessionRegistryUnavailableResponse();
    if (!isRecentSupabaseAuthentication(verifiedSession.identity)) {
      return sessionEndedResponse(
        existingBinding.state === "revoked" ? "session-revoked" : "session-expired",
      );
    }

    const registeredSupabaseSession = await getLoginSessionBySupabaseSession(
      verifiedSession.identity.userId,
      verifiedSession.identity.sessionId,
    );
    if (registeredSupabaseSession.state === "unavailable") {
      return sessionRegistryUnavailableResponse();
    }
    if (registeredSupabaseSession.state !== "missing") {
      return sessionEndedResponse(
        registeredSupabaseSession.state === "revoked" ? "session-revoked" : "session-expired",
      );
    }

    if (isPasswordRecoveryAuthentication(verifiedSession.identity.authenticationMethod, parsed.data.passwordResetCompleted === true)) {
      const { error: authRevocationError } = await serviceSupabase.auth.admin.signOut(
        parsed.data.accessToken,
        "others",
      );
      if (authRevocationError) return sessionRegistryUnavailableResponse();

      const appRevocation = await revokeOtherLoginSessionsForUser(
        verifiedSession.identity.userId,
        null,
        "password_recovery",
      );
      if (!appRevocation.ok) return sessionRegistryUnavailableResponse();
    }

    sessionToken = crypto.randomUUID();
    const created = await createLoginSession({
      request,
      sessionToken,
      userId: verifiedSession.identity.userId,
      supabaseSessionId: verifiedSession.identity.sessionId,
      rememberMe,
    });
    if (!created.ok) {
      return created.reason === "unavailable" || created.reason === "error"
        ? sessionRegistryUnavailableResponse()
        : sessionEndedResponse("session-expired");
    }
  }

  const supabase = verifiedSession.client;
  const user = verifiedSession.user;
  if (user.email) {
    await acceptPendingMemberInvitesForUser(serviceSupabase, user);
  }

  const membershipSupabase = serviceSupabase ?? supabase;
  let defaultBusinessId = parsed.data.businessId ?? null;
  let defaultPath: string | null = null;

  if (parsed.data.businessId) {
    const { data: membership, error: membershipError } = await membershipSupabase
      .from("business_members")
      .select("business_id, role, access_scope, access_permissions")
      .eq("business_id", parsed.data.businessId)
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (membershipError) {
      return NextResponse.json({ error: membershipError.message }, { status: 500, headers: { "cache-control": "no-store" } });
    }

    if (!membership?.business_id) {
      return NextResponse.json({ error: "User is not a member of this business." }, { status: 403, headers: { "cache-control": "no-store" } });
    }

    defaultPath = defaultMembershipPath(membership);
  } else {
    const { data: membership, error: membershipError } = await membershipSupabase
      .from("business_members")
      .select("business_id, role, access_scope, access_permissions")
      .eq("auth_user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (membershipError) {
      return NextResponse.json({ error: membershipError.message }, { status: 500, headers: { "cache-control": "no-store" } });
    }

    defaultBusinessId = membership?.business_id ?? null;

    if (membership?.business_id) {
      defaultPath = defaultMembershipPath(membership);
    }
  }

  const response = NextResponse.json(
    { ok: true, defaultBusinessId, hasBusiness: Boolean(defaultBusinessId), defaultPath },
    { headers: { "cache-control": "no-store" } },
  );
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
