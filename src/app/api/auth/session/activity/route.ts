import { NextResponse } from "next/server";
import { isApiResponse, requireAuthenticatedUser } from "@/lib/auth/api";
import {
  serverAccessTokenCookie,
  serverBusinessCookie,
  serverLastActivityCookie,
  serverRefreshTokenCookie,
  serverSessionIdCookie,
  serverSessionRememberCookie,
} from "@/lib/auth/runtime";
import { touchLoginSession } from "@/lib/auth/login-sessions";
import { accessTokenCookieMaxAge } from "@/lib/auth/token";
import {
  nowSeconds,
  parseCookieHeader,
  rememberCookieValue,
  sessionCookieMaxAge,
  sessionCookieOptions,
} from "@/lib/auth/session-policy";

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
  const user = await requireAuthenticatedUser(request);
  if (isApiResponse(user)) return user;
  if (user.demoMode) {
    return NextResponse.json({ ok: true, demoMode: true }, { headers: { "cache-control": "no-store" } });
  }

  if (!user.sessionToken || !user.supabaseSessionId) {
    return NextResponse.json(
      { error: "Sesi login tidak valid." },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const maxAge = sessionCookieMaxAge(user.rememberMe);
  const accessToken = cookies.get(serverAccessTokenCookie);
  const refreshToken = cookies.get(serverRefreshTokenCookie);
  const businessId = cookies.get(serverBusinessCookie);
  const sessionToken = user.sessionToken;

  const touched = await touchLoginSession({
    request,
    sessionToken,
    userId: user.userId,
    supabaseSessionId: user.supabaseSessionId,
    rememberMe: user.rememberMe,
  });
  if (!touched) {
    return NextResponse.json(
      { error: "Session registry is temporarily unavailable." },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  const response = NextResponse.json(
    {
      ok: true,
      rememberMe: user.rememberMe,
      idleTimeoutSeconds: maxAge,
    },
    { headers: { "cache-control": "no-store" } },
  );

  touchCookie(response, serverAccessTokenCookie, accessToken, accessToken ? Math.min(accessTokenCookieMaxAge(accessToken), maxAge) : maxAge);
  touchCookie(response, serverRefreshTokenCookie, refreshToken, maxAge);
  touchCookie(response, serverBusinessCookie, businessId, maxAge);
  touchCookie(response, serverSessionIdCookie, sessionToken, maxAge);
  response.cookies.set(serverSessionRememberCookie, rememberCookieValue(user.rememberMe), sessionCookieOptions(maxAge));
  response.cookies.set(serverLastActivityCookie, String(nowSeconds()), sessionCookieOptions(maxAge));

  return response;
}
