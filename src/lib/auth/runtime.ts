export const serverAccessTokenCookie = "valuintcorp.sb-access-token";
export const serverBusinessCookie = "valuintcorp.active-business-id";

export function isSupabaseEnvConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function isExplicitDemoMode() {
  return process.env.NEXT_PUBLIC_DEMO_MODE === "true";
}

export function shouldUseDemoFallback() {
  return !isSupabaseEnvConfigured() || isExplicitDemoMode();
}
