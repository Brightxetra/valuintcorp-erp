import { createClient } from "@supabase/supabase-js";
import {
  getSupabasePublicConfig,
  isSupabaseServiceRoleKey,
  sanitizeSupabaseEnvValue,
} from "@/lib/supabase/config";

const projectRefPattern = /^[a-z0-9]{20}$/;

function getSupabaseServiceConfiguration() {
  const publicConfig = getSupabasePublicConfig();
  const projectRef = sanitizeSupabaseEnvValue(process.env.SUPABASE_PROJECT_REF);
  const serviceRoleKey = sanitizeSupabaseEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (
    !publicConfig ||
    !projectRef ||
    !projectRefPattern.test(projectRef ?? "") ||
    !serviceRoleKey ||
    !isSupabaseServiceRoleKey(serviceRoleKey)
  ) {
    return null;
  }

  return {
    canonicalOrigin: `https://${projectRef}.supabase.co`,
    serviceRoleKey,
  };
}

function createPinnedServiceFetch(canonicalOrigin: string) {
  return async function pinnedServiceFetch(
    input: RequestInfo | URL,
    init: RequestInit = {},
  ) {
    let requestOrigin = "";

    try {
      const requestTarget =
        typeof input === "string" || input instanceof URL ? input : input.url;
      requestOrigin = new URL(requestTarget, canonicalOrigin).origin;
    } catch {
      throw new Error("Supabase service request origin is invalid.");
    }

    if (requestOrigin !== canonicalOrigin) {
      throw new Error("Supabase service request origin is invalid.");
    }

    return fetch(input, {
      ...init,
      redirect: "error",
    });
  };
}

export function isSupabaseServiceConfigured() {
  return Boolean(getSupabaseServiceConfiguration());
}

export function createServiceSupabaseClient() {
  const config = getSupabaseServiceConfiguration();

  if (!config) {
    throw new Error(
      "Supabase service client requires valid NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_PROJECT_REF, and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createClient(config.canonicalOrigin, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: { fetch: createPinnedServiceFetch(config.canonicalOrigin) },
  });
}
