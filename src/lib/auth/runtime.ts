import { hasSupabasePublicConfig } from "@/lib/supabase/config";

export const serverAccessTokenCookie = "valuintcorp.sb-access-token";
export const serverRefreshTokenCookie = "valuintcorp.sb-refresh-token";
export const serverBusinessCookie = "valuintcorp.active-business-id";
export const serverSessionIdCookie = "valuintcorp.session-id";
export const serverSessionRememberCookie = "valuintcorp.session-remember";
export const serverLastActivityCookie = "valuintcorp.last-activity";

export const persistentSessionMaxAgeSeconds = 60 * 60 * 24 * 30;
export const sessionActivityTouchIntervalSeconds = 60;

export function idleSessionTimeoutSeconds() {
  const configured = Number(process.env.NEXT_PUBLIC_SESSION_IDLE_TIMEOUT_SECONDS);

  return Number.isFinite(configured) && configured >= 60 ? Math.floor(configured) : 30 * 60;
}

export function isSupabaseEnvConfigured() {
  return hasSupabasePublicConfig();
}

export function isExplicitDemoMode() {
  return process.env.NEXT_PUBLIC_DEMO_MODE === "true";
}

export function shouldUseDemoFallback() {
  return !isSupabaseEnvConfigured() || isExplicitDemoMode();
}
