const WRAPPING_QUOTES = /^["'`]+|["'`]+$/g;
const HEADER_UNSAFE_CHARACTERS = /[^\x21-\x7e]/g;
const PUBLISHABLE_KEY_PATTERN = /^sb_publishable_[A-Za-z0-9_-]+$/;
const SECRET_KEY_PATTERN = /^sb_secret_[A-Za-z0-9_-]+$/;

export interface SupabasePublicConfig {
  url: string;
  anonKey: string;
}

export function getErpAttachmentsBucket() {
  return process.env.SUPABASE_ERP_ATTACHMENTS_BUCKET?.trim() || "erp-attachments";
}

export function sanitizeSupabaseEnvValue(value: string | null | undefined) {
  const compact = value?.trim().replace(HEADER_UNSAFE_CHARACTERS, "") ?? "";
  const sanitized = compact.replace(WRAPPING_QUOTES, "");
  return sanitized || null;
}

function legacySupabaseJwtRole(value: string) {
  const parts = value.split(".");
  if (parts.length !== 3) return null;

  try {
    const encodedPayload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padding = "=".repeat((4 - (encodedPayload.length % 4)) % 4);
    const payload = JSON.parse(atob(`${encodedPayload}${padding}`)) as unknown;

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    const role = (payload as { role?: unknown }).role;
    return typeof role === "string" ? role : null;
  } catch {
    return null;
  }
}

export function isSupabasePublicKey(value: string | null | undefined) {
  const key = sanitizeSupabaseEnvValue(value);
  if (!key) return false;

  return PUBLISHABLE_KEY_PATTERN.test(key) || legacySupabaseJwtRole(key) === "anon";
}

export function isSupabaseServiceRoleKey(value: string | null | undefined) {
  const key = sanitizeSupabaseEnvValue(value);
  if (!key) return false;

  return SECRET_KEY_PATTERN.test(key) || legacySupabaseJwtRole(key) === "service_role";
}

export function getSupabasePublicConfig(): SupabasePublicConfig | null {
  const url = sanitizeSupabaseEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = sanitizeSupabaseEnvValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  return url && anonKey && isSupabasePublicKey(anonKey) ? { url, anonKey } : null;
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
