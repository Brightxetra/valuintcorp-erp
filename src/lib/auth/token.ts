export function secondsUntilJwtExpiry(token: string, nowSeconds = Math.floor(Date.now() / 1000)) {
  const [, payload] = token.split(".");

  if (!payload) return null;

  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const decoded = JSON.parse(globalThis.atob(padded)) as { exp?: unknown };

    return typeof decoded.exp === "number" ? decoded.exp - nowSeconds : null;
  } catch {
    return null;
  }
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
