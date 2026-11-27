import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import {
  verifiedSupabaseSessionIdentity,
  type VerifiedSupabaseSessionIdentity,
} from "@/lib/auth/token";
import { requireSupabasePublicConfig } from "@/lib/supabase/config";

export interface VerifiedSupabaseSession {
  accessToken: string;
  client: SupabaseClient;
  identity: VerifiedSupabaseSessionIdentity;
  user: User;
}

export function bearerTokenFromAuthorization(authorization: string | null | undefined) {
  const match = authorization?.match(/^Bearer\s+([^\s]+)$/i);
  return match?.[1] ?? null;
}

function createTokenSupabaseClient(accessToken: string) {
  const { url, anonKey } = requireSupabasePublicConfig("Supabase verified session");

  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export async function verifySupabaseAccessToken(
  accessToken: string,
): Promise<VerifiedSupabaseSession | null> {
  try {
    const client = createTokenSupabaseClient(accessToken);
    const { data, error } = await client.auth.getUser(accessToken);

    if (error || !data.user) return null;

    const identity = verifiedSupabaseSessionIdentity(accessToken, data.user.id);
    if (!identity) return null;

    return {
      accessToken,
      client,
      identity,
      user: data.user,
    };
  } catch {
    return null;
  }
}

export async function verifySupabaseAuthorization(
  authorization: string | null | undefined,
) {
  const accessToken = bearerTokenFromAuthorization(authorization);
  return accessToken ? verifySupabaseAccessToken(accessToken) : null;
}
