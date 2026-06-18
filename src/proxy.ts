import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { serverAccessTokenCookie, shouldUseDemoFallback } from "@/lib/auth/runtime";

export function proxy(request: NextRequest) {
  if (shouldUseDemoFallback()) {
    return NextResponse.next();
  }

  if (request.cookies.get(serverAccessTokenCookie)?.value) {
    return NextResponse.next();
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);

  return NextResponse.redirect(loginUrl);
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
