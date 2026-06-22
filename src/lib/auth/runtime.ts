import { hasSupabasePublicConfig } from "@/lib/supabase/config";

export const serverAccessTokenCookie = "valuintcorp.sb-access-token";
export const serverRefreshTokenCookie = "valuintcorp.sb-refresh-token";
export const serverBusinessCookie = "valuintcorp.active-business-id";

export function isSupabaseEnvConfigured() {
  return hasSupabasePublicConfig();
}

export function isExplicitDemoMode() {
  return process.env.NEXT_PUBLIC_DEMO_MODE === "true";
}

export function shouldUseDemoFallback() {
  return !isSupabaseEnvConfigured() || isExplicitDemoMode();
}
