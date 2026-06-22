import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  serverAccessTokenCookie,
  serverBusinessCookie,
  serverLastActivityCookie,
  serverRefreshTokenCookie,
  serverSessionIdCookie,
  serverSessionRememberCookie,
  shouldUseDemoFallback,
} from "@/lib/auth/runtime";
import { upsertLoginSession } from "@/lib/auth/login-sessions";
import { accessTokenCookieMaxAge } from "@/lib/auth/token";
import { validateRequestSession } from "@/lib/auth/session-guard";
import {
  nowSeconds,
  parseCookieHeader,
  rememberCookieValue,
  sessionCookieMaxAge,
  sessionCookieOptions,
} from "@/lib/auth/session-policy";
import { requireSupabasePublicConfig } from "@/lib/supabase/config";

function createAuthorizedSupabaseClient(authorization: string) {
  const { url, anonKey } = requireSupabasePublicConfig("Supabase session activity");

  return createClient(url, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authorization } },
  });
}

function touchCookie(
  response: NextResponse,
  name: string,
  value: string | null | undefined,
  maxAge: number,
) {
  if (value) {
    response.cookies.set(name, value, sessionCookieOptions(maxAge));
  }
}

export async function POST(request: Request) {
  if (shouldUseDemoFallback()) {
    return NextResponse.json({ ok: true, demoMode: true }, { headers: { "cache-control": "no-store" } });
  }

  const guard = await validateRequestSession(request);

  if (!guard.ok) {
    return guard.response;
  }

  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const maxAge = sessionCookieMaxAge(guard.rememberMe);
  const accessToken = cookies.get(serverAccessTokenCookie);
  const refreshToken = cookies.get(serverRefreshTokenCookie);
  const businessId = cookies.get(serverBusinessCookie);
  const sessionToken = guard.sessionToken ?? crypto.randomUUID();
  const response = NextResponse.json(
    {
      ok: true,
      rememberMe: guard.rememberMe,
      idleTimeoutSeconds: maxAge,
    },
    { headers: { "cache-control": "no-store" } },
  );

  touchCookie(response, serverAccessTokenCookie, accessToken, accessToken ? Math.min(accessTokenCookieMaxAge(accessToken), maxAge) : maxAge);
  touchCookie(response, serverRefreshTokenCookie, refreshToken, maxAge);
  touchCookie(response, serverBusinessCookie, businessId, maxAge);
  touchCookie(response, serverSessionIdCookie, sessionToken, maxAge);
  response.cookies.set(serverSessionRememberCookie, rememberCookieValue(guard.rememberMe), sessionCookieOptions(maxAge));
  response.cookies.set(serverLastActivityCookie, String(nowSeconds()), sessionCookieOptions(maxAge));

  const authorization = request.headers.get("authorization");

  if (authorization) {
    const supabase = createAuthorizedSupabaseClient(authorization);
    const { data } = await supabase.auth.getUser();

    if (data.user) {
      await upsertLoginSession({
        request,
        sessionToken,
        userId: data.user.id,
        rememberMe: guard.rememberMe,
      });
    }
  }

  return response;
}
