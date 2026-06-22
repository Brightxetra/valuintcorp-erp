import { createClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig, sanitizeSupabaseEnvValue } from "@/lib/supabase/config";

export function isSupabaseServiceConfigured() {
  return Boolean(getSupabasePublicConfig() && sanitizeSupabaseEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY));
}

export function createServiceSupabaseClient() {
  const config = getSupabasePublicConfig();
  const serviceRoleKey = sanitizeSupabaseEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!config || !serviceRoleKey) {
    throw new Error("Supabase service client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createClient(config.url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
