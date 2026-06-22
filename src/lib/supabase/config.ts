const WRAPPING_QUOTES = /^["'`]+|["'`]+$/g;
const HEADER_UNSAFE_CHARACTERS = /[^\x21-\x7e]/g;

export interface SupabasePublicConfig {
  url: string;
  anonKey: string;
}

export function sanitizeSupabaseEnvValue(value: string | null | undefined) {
  const compact = value?.trim().replace(HEADER_UNSAFE_CHARACTERS, "") ?? "";
  const sanitized = compact.replace(WRAPPING_QUOTES, "");
  return sanitized || null;
}

export function getSupabasePublicConfig(): SupabasePublicConfig | null {
  const url = sanitizeSupabaseEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = sanitizeSupabaseEnvValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  return url && anonKey ? { url, anonKey } : null;
}

export function requireSupabasePublicConfig(context: string): SupabasePublicConfig {
  const config = getSupabasePublicConfig();

  if (!config) {
    throw new Error(`${context} requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.`);
  }

  return config;
}

export function hasSupabasePublicConfig() {
  return Boolean(getSupabasePublicConfig());
}
