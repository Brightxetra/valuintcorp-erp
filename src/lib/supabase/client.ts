import { createClient } from "@supabase/supabase-js";
import { requireSupabasePublicConfig } from "@/lib/supabase/config";

let browserClient: ReturnType<typeof createClient> | null = null;

export function createBrowserSupabaseClient() {
  const { url, anonKey } = requireSupabasePublicConfig("Supabase browser client");

  browserClient ??= createClient(url, anonKey);
  return browserClient;
}
