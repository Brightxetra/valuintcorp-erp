import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serverAccessTokenCookie, serverRefreshTokenCookie, shouldUseDemoFallback } from "@/lib/auth/runtime";
import { accessTokenCookieMaxAge, shouldRefreshAccessToken } from "@/lib/auth/token";

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

function loginRedirect(request: NextRequest) {
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);

  const response = NextResponse.redirect(loginUrl);
  response.cookies.set(serverAccessTokenCookie, "", cookieOptions(0));
  response.cookies.set(serverRefreshTokenCookie, "", cookieOptions(0));

  return response;
}

async function refreshServerSession(refreshToken: string) {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
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
  response.cookies.set(
    serverAccessTokenCookie,
    session.access_token,
    cookieOptions(accessTokenCookieMaxAge(session.access_token, session.expires_in)),
  );
  response.cookies.set(serverRefreshTokenCookie, session.refresh_token, cookieOptions(60 * 60 * 24 * 30));

  return response;
}

export async function proxy(request: NextRequest) {
  if (shouldUseDemoFallback()) {
    return NextResponse.next();
  }

  const accessToken = request.cookies.get(serverAccessTokenCookie)?.value;
  const refreshToken = request.cookies.get(serverRefreshTokenCookie)?.value;

  if (accessToken && !shouldRefreshAccessToken(accessToken)) {
    return NextResponse.next();
  }

  if (refreshToken) {
    const refreshed = await refreshServerSession(refreshToken);

    if (refreshed) return refreshed;
  }

  if (accessToken) {
    return NextResponse.next();
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
