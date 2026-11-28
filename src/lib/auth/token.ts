const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface SupabaseJwtClaims {
  sub?: unknown;
  session_id?: unknown;
  amr?: unknown;
}

export interface VerifiedSupabaseSessionIdentity {
  userId: string;
  sessionId: string;
  authenticationMethod: string | null;
  authenticatedAt: number | null;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const [, payload] = token.split(".");

  if (!payload) return null;

  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const decoded = JSON.parse(globalThis.atob(padded)) as unknown;

    return decoded && typeof decoded === "object"
      ? (decoded as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function secondsUntilJwtExpiry(token: string, nowSeconds = Math.floor(Date.now() / 1000)) {
  const decoded = decodeJwtPayload(token);
  return typeof decoded?.exp === "number" ? decoded.exp - nowSeconds : null;
}

export function verifiedSupabaseSessionIdentity(
  token: string,
  verifiedUserId: string,
): VerifiedSupabaseSessionIdentity | null {
  const claims = decodeJwtPayload(token) as SupabaseJwtClaims | null;

  if (
    !claims ||
    claims.sub !== verifiedUserId ||
    typeof claims.session_id !== "string" ||
    !uuidPattern.test(claims.session_id)
  ) {
    return null;
  }

  const authentication = Array.isArray(claims.amr)
    ? claims.amr
        .filter(
          (entry): entry is { method: string; timestamp: number } =>
            Boolean(entry) &&
            typeof entry === "object" &&
            typeof (entry as { method?: unknown }).method === "string" &&
            typeof (entry as { timestamp?: unknown }).timestamp === "number" &&
            Number.isFinite((entry as { timestamp: number }).timestamp) &&
            (entry as { method: string }).method !== "token_refresh",
        )
        .sort((left, right) => right.timestamp - left.timestamp)[0]
    : undefined;

  return {
    userId: verifiedUserId,
    sessionId: claims.session_id,
    authenticationMethod: authentication?.method ?? null,
    authenticatedAt: authentication?.timestamp ?? null,
  };
}

export function isRecentSupabaseAuthentication(
  identity: VerifiedSupabaseSessionIdentity,
  timestampSeconds = Math.floor(Date.now() / 1000),
  maxAgeSeconds = 5 * 60,
) {
  if (!identity.authenticationMethod || identity.authenticatedAt === null) return false;

  return (
    identity.authenticatedAt <= timestampSeconds + 60 &&
    timestampSeconds - identity.authenticatedAt <= maxAgeSeconds
  );
}

export function isPasswordRecoveryAuthentication(method: string | null | undefined, recoveryFlow: boolean) {
  // GoTrue issues the OTP authentication method for implicit and token-hash email links.
  return method === "recovery" || (method === "otp" && recoveryFlow);
}

export function accessTokenCookieMaxAge(token: string, fallbackSeconds = 60 * 60) {
  const seconds = secondsUntilJwtExpiry(token);

  if (seconds === null) return fallbackSeconds;

  return Math.max(1, Math.min(seconds, fallbackSeconds));
}

export function shouldRefreshAccessToken(token: string, refreshWindowSeconds = 2 * 60) {
  const seconds = secondsUntilJwtExpiry(token);

  return seconds !== null && seconds <= refreshWindowSeconds;
}
