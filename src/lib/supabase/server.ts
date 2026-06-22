import { createClient } from "@supabase/supabase-js";
import { requireSupabasePublicConfig } from "@/lib/supabase/config";

export function createRequestSupabaseClient(request: Request) {
  const { url, anonKey } = requireSupabasePublicConfig("Supabase request client");
  const authorization = request.headers.get("authorization");

  if (!authorization) {
    throw new Error("Supabase request client requires env vars and Authorization header.");
  }

  return createClient(url, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authorization } },
  });
}
