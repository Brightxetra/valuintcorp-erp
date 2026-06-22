import type { NextRequest } from "next/server";
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
import { validateRequestSession } from "@/lib/auth/session-guard";
import { accessTokenCookieMaxAge, shouldRefreshAccessToken } from "@/lib/auth/token";
import {
  nowSeconds,
  rememberCookieValue,
  sessionCookieMaxAge,
  sessionCookieOptions,
  type SessionEndReason,
} from "@/lib/auth/session-policy";
import { requireSupabasePublicConfig } from "@/lib/supabase/config";

function clearAuthCookies(response: NextResponse) {
  response.cookies.set(serverAccessTokenCookie, "", sessionCookieOptions(0));
  response.cookies.set(serverRefreshTokenCookie, "", sessionCookieOptions(0));
  response.cookies.set(serverBusinessCookie, "", sessionCookieOptions(0));
  response.cookies.set(serverSessionIdCookie, "", sessionCookieOptions(0));
  response.cookies.set(serverSessionRememberCookie, "", sessionCookieOptions(0));
  response.cookies.set(serverLastActivityCookie, "", sessionCookieOptions(0));
  return response;
}

function touchActivityCookie(response: NextResponse, rememberMe: boolean) {
  const maxAge = sessionCookieMaxAge(rememberMe);
  response.cookies.set(serverSessionRememberCookie, rememberCookieValue(rememberMe), sessionCookieOptions(maxAge));
  response.cookies.set(serverLastActivityCookie, String(nowSeconds()), sessionCookieOptions(maxAge));
  return response;
}

function touchRequestSessionCookies(response: NextResponse, request: NextRequest, rememberMe: boolean) {
  const maxAge = sessionCookieMaxAge(rememberMe);
  const accessToken = request.cookies.get(serverAccessTokenCookie)?.value;
  const refreshToken = request.cookies.get(serverRefreshTokenCookie)?.value;
  const businessId = request.cookies.get(serverBusinessCookie)?.value;
  const sessionToken = request.cookies.get(serverSessionIdCookie)?.value;

  if (accessToken) {
    response.cookies.set(serverAccessTokenCookie, accessToken, sessionCookieOptions(Math.min(accessTokenCookieMaxAge(accessToken), maxAge)));
  }

  if (refreshToken) {
    response.cookies.set(serverRefreshTokenCookie, refreshToken, sessionCookieOptions(maxAge));
  }

  if (businessId) {
    response.cookies.set(serverBusinessCookie, businessId, sessionCookieOptions(maxAge));
  }

  if (sessionToken) {
    response.cookies.set(serverSessionIdCookie, sessionToken, sessionCookieOptions(maxAge));
  }

  return touchActivityCookie(response, rememberMe);
}

function loginRedirect(request: NextRequest, reason?: SessionEndReason) {
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  if (reason) {
    loginUrl.searchParams.set("reason", reason);
  }
  loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);

  const response = NextResponse.redirect(loginUrl);

  return clearAuthCookies(response);
}

async function refreshServerSession(refreshToken: string, rememberMe: boolean, request: NextRequest) {
  const { url, anonKey } = requireSupabasePublicConfig("Supabase session refresh");
  const supabase = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
  const session = data.session;

  if (error || !session?.access_token || !session.refresh_token) {
    return null;
  }

  const response = NextResponse.next();
  const maxAge = sessionCookieMaxAge(rememberMe);
  response.cookies.set(
    serverAccessTokenCookie,
    session.access_token,
    sessionCookieOptions(Math.min(accessTokenCookieMaxAge(session.access_token, session.expires_in), maxAge)),
  );
  response.cookies.set(serverRefreshTokenCookie, session.refresh_token, sessionCookieOptions(maxAge));
  const businessId = request.cookies.get(serverBusinessCookie)?.value;
  const sessionToken = request.cookies.get(serverSessionIdCookie)?.value;

  if (businessId) {
    response.cookies.set(serverBusinessCookie, businessId, sessionCookieOptions(maxAge));
  }

  if (sessionToken) {
    response.cookies.set(serverSessionIdCookie, sessionToken, sessionCookieOptions(maxAge));
  }

  touchActivityCookie(response, rememberMe);

  return response;
}

export async function proxy(request: NextRequest) {
  if (shouldUseDemoFallback()) {
    return NextResponse.next();
  }

  const accessToken = request.cookies.get(serverAccessTokenCookie)?.value;
  const refreshToken = request.cookies.get(serverRefreshTokenCookie)?.value;

  if (accessToken || refreshToken) {
    const guard = await validateRequestSession(request);

    if (!guard.ok) {
      return loginRedirect(request, guard.reason);
    }

    if (accessToken && !shouldRefreshAccessToken(accessToken)) {
      return touchRequestSessionCookies(NextResponse.next(), request, guard.rememberMe);
    }

    if (refreshToken) {
      const refreshed = await refreshServerSession(refreshToken, guard.rememberMe, request);

      if (refreshed) return refreshed;
    }

    if (accessToken) {
      return touchRequestSessionCookies(NextResponse.next(), request, guard.rememberMe);
    }
  }

  return loginRedirect(request);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/sales/:path*",
    "/purchases/:path*",
    "/inventory/:path*",
    "/accounting/:path*",
    "/reports/:path*",
    "/hr/:path*",
    "/tax/:path*",
    "/settings/:path*",
    "/onboarding/:path*",
    "/transaksi/:path*",
    "/produk/:path*",
    "/karyawan/:path*",
    "/keuangan/:path*",
  ],
};
