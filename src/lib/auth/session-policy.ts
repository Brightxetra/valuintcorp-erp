import {
  idleSessionTimeoutSeconds,
  persistentSessionMaxAgeSeconds,
  serverAccessTokenCookie,
  serverBusinessCookie,
  serverLastActivityCookie,
  serverRefreshTokenCookie,
  serverSessionIdCookie,
  serverSessionRememberCookie,
} from "@/lib/auth/runtime";

export type SessionEndReason = "session-expired" | "session-revoked";

const sessionCookieNames = [
  serverAccessTokenCookie,
  serverRefreshTokenCookie,
  serverBusinessCookie,
  serverSessionIdCookie,
  serverSessionRememberCookie,
  serverLastActivityCookie,
];

export function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

export function parseCookieHeader(cookieHeader: string | null | undefined) {
  const cookies = new Map<string, string>();

  if (!cookieHeader) return cookies;

  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (!rawName) continue;
    const value = rawValue.join("=") ?? "";
    try {
      cookies.set(rawName, decodeURIComponent(value));
    } catch {
      cookies.set(rawName, value);
    }
  }

  return cookies;
}

export function requestCookie(request: Request, name: string) {
  return parseCookieHeader(request.headers.get("cookie")).get(name) ?? null;
}

export function rememberCookieValue(rememberMe: boolean) {
  return rememberMe ? "1" : "0";
}

export function isRememberedSessionFromCookies(cookies: Map<string, string>) {
  return cookies.get(serverSessionRememberCookie) === "1";
}

export function sessionCookieMaxAge(rememberMe: boolean) {
  return rememberMe ? persistentSessionMaxAgeSeconds : idleSessionTimeoutSeconds();
}

export function sessionExpiresAt(rememberMe: boolean, timestampSeconds = nowSeconds()) {
  return new Date((timestampSeconds + sessionCookieMaxAge(rememberMe)) * 1000).toISOString();
}

export function isIdleSessionExpired(
  lastActivitySeconds: number | null | undefined,
  rememberMe: boolean,
  timestampSeconds = nowSeconds(),
) {
  if (rememberMe) return false;
  if (!lastActivitySeconds) return false;

  return timestampSeconds - lastActivitySeconds > idleSessionTimeoutSeconds();
}

export function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

function serializedCookie(name: string, value: string, maxAge: number) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=/; SameSite=Lax; HttpOnly; Max-Age=${Math.max(0, Math.floor(maxAge))}${secure}`;
}

export function appendClearSessionCookies(response: Response) {
  for (const name of sessionCookieNames) {
    response.headers.append("set-cookie", serializedCookie(name, "", 0));
  }

  return response;
}

export function sessionEndedResponse(reason: SessionEndReason) {
  const response = Response.json(
    {
      error:
        reason === "session-revoked"
          ? "Sesi perangkat ini sudah dikeluarkan."
          : "Sesi berakhir karena tidak aktif.",
      code: reason,
    },
    { status: 401, headers: { "cache-control": "no-store" } },
  );

  return appendClearSessionCookies(response);
}

export async function hashSessionToken(sessionToken: string) {
  const bytes = new TextEncoder().encode(sessionToken);
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function clientIpFromRequest(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (
    forwarded ||
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-vercel-forwarded-for") ||
    null
  );
}

export function locationFromRequest(request: Request) {
  const city = request.headers.get("x-vercel-ip-city");
  const region = request.headers.get("x-vercel-ip-country-region");
  const country = request.headers.get("x-vercel-ip-country");

  return [city, region, country].filter(Boolean).join(", ") || null;
}

export function deviceLabelFromUserAgent(userAgent: string | null) {
  if (!userAgent) return "Perangkat tidak dikenal";

  const browser = userAgent.includes("Edg/")
    ? "Edge"
    : userAgent.includes("Chrome/")
      ? "Chrome"
      : userAgent.includes("Firefox/")
        ? "Firefox"
        : userAgent.includes("Safari/")
          ? "Safari"
          : "Browser";

  const platform = userAgent.includes("Windows")
    ? "Windows"
    : userAgent.includes("Android")
      ? "Android"
      : userAgent.includes("iPhone") || userAgent.includes("iPad")
        ? "iOS"
        : userAgent.includes("Mac OS")
          ? "macOS"
          : userAgent.includes("Linux")
            ? "Linux"
            : "Perangkat";

  return `${browser} di ${platform}`;
}
