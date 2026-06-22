import { createServiceSupabaseClient, isSupabaseServiceConfigured } from "@/lib/supabase/service";
import {
  clientIpFromRequest,
  deviceLabelFromUserAgent,
  hashSessionToken,
  locationFromRequest,
  sessionExpiresAt,
} from "@/lib/auth/session-policy";

export interface LoginSessionDevice {
  id: string;
  deviceLabel: string;
  ipAddress: string | null;
  location: string | null;
  userAgent: string | null;
  rememberMe: boolean;
  status: "active" | "revoked" | "expired";
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  current: boolean;
}

interface LoginSessionRow {
  id: string;
  auth_user_id: string;
  session_token_hash: string;
  device_label?: string | null;
  ip_address?: string | null;
  location?: string | null;
  user_agent?: string | null;
  remember_me?: boolean | null;
  status?: "active" | "revoked" | "expired" | null;
  created_at?: string | null;
  last_seen_at?: string | null;
  expires_at?: string | null;
  revoked_at?: string | null;
}

type RawLoginSessionStatus = "active" | "revoked" | "expired" | string | null | undefined;

function serviceOrNull() {
  return isSupabaseServiceConfigured() ? createServiceSupabaseClient() : null;
}

function safeIp(ipAddress: string | null) {
  return ipAddress && /^[0-9a-fA-F:.]+$/.test(ipAddress) ? ipAddress : null;
}

export function loginSessionStatus(
  status: RawLoginSessionStatus,
  expiresAt: string | null | undefined,
  timestamp = Date.now(),
): LoginSessionDevice["status"] {
  if (status === "revoked") return "revoked";
  if (status === "expired") return "expired";
  if (status !== "active" && status != null) return "revoked";
  if (expiresAt && Date.parse(expiresAt) < timestamp) return "expired";
  return "active";
}

export async function upsertLoginSession(params: {
  request: Request;
  sessionToken: string;
  userId: string;
  rememberMe: boolean;
}) {
  const service = serviceOrNull();
  if (!service) return;

  const sessionHash = await hashSessionToken(params.sessionToken);
  const userAgent = params.request.headers.get("user-agent");
  const expiresAt = sessionExpiresAt(params.rememberMe);

  await service.from("user_login_sessions").upsert(
    {
      auth_user_id: params.userId,
      session_token_hash: sessionHash,
      remember_me: params.rememberMe,
      device_label: deviceLabelFromUserAgent(userAgent),
      user_agent: userAgent,
      ip_address: safeIp(clientIpFromRequest(params.request)),
      location: locationFromRequest(params.request),
      status: "active",
      last_seen_at: new Date().toISOString(),
      expires_at: expiresAt,
      revoked_at: null,
      revoked_by: null,
      revoked_reason: null,
    },
    { onConflict: "session_token_hash" },
  );
}

export async function touchLoginSession(params: {
  request: Request;
  sessionToken: string | null;
  rememberMe: boolean;
}) {
  if (!params.sessionToken) return;

  const service = serviceOrNull();
  if (!service) return;

  const sessionHash = await hashSessionToken(params.sessionToken);
  await service
    .from("user_login_sessions")
    .update({
      last_seen_at: new Date().toISOString(),
      expires_at: sessionExpiresAt(params.rememberMe),
      ip_address: safeIp(clientIpFromRequest(params.request)),
      location: locationFromRequest(params.request),
    })
    .eq("session_token_hash", sessionHash)
    .eq("status", "active");
}

export async function getLoginSessionStatus(sessionToken: string | null) {
  if (!sessionToken) return "missing" as const;

  const service = serviceOrNull();
  if (!service) return "active" as const;

  const sessionHash = await hashSessionToken(sessionToken);
  const { data, error } = await service
    .from("user_login_sessions")
    .select("status, expires_at")
    .eq("session_token_hash", sessionHash)
    .maybeSingle();

  if (error || !data) return "active" as const;

  const row = data as { status?: string | null; expires_at?: string | null };
  return loginSessionStatus(row.status, row.expires_at);
}

export async function revokeLoginSessionByToken(sessionToken: string | null, userId?: string | null, reason = "logout") {
  if (!sessionToken) return;

  const service = serviceOrNull();
  if (!service) return;

  const sessionHash = await hashSessionToken(sessionToken);
  const query = service
    .from("user_login_sessions")
    .update({
      status: "revoked",
      revoked_at: new Date().toISOString(),
      revoked_by: userId ?? null,
      revoked_reason: reason,
    })
    .eq("session_token_hash", sessionHash);

  if (userId) {
    query.eq("auth_user_id", userId);
  }

  await query;
}

export async function listLoginSessionsForUser(userId: string, currentSessionToken: string | null) {
  const service = serviceOrNull();
  if (!service) return [] satisfies LoginSessionDevice[];

  const currentHash = currentSessionToken ? await hashSessionToken(currentSessionToken) : null;
  const { data, error } = await service
    .from("user_login_sessions")
    .select("id, auth_user_id, session_token_hash, device_label, ip_address, location, user_agent, remember_me, status, created_at, last_seen_at, expires_at, revoked_at")
    .eq("auth_user_id", userId)
    .eq("status", "active")
    .order("last_seen_at", { ascending: false });

  if (error || !Array.isArray(data)) return [] satisfies LoginSessionDevice[];

  const timestamp = Date.now();

  return (data as LoginSessionRow[])
    .map((row) => {
      const status = loginSessionStatus(row.status, row.expires_at, timestamp);

      return {
        id: row.id,
        deviceLabel: row.device_label ?? "Perangkat tidak dikenal",
        ipAddress: row.ip_address ?? null,
        location: row.location ?? null,
        userAgent: row.user_agent ?? null,
        rememberMe: Boolean(row.remember_me),
        status,
        createdAt: row.created_at ?? "",
        lastSeenAt: row.last_seen_at ?? "",
        expiresAt: row.expires_at ?? null,
        revokedAt: row.revoked_at ?? null,
        current: Boolean(currentHash && row.session_token_hash === currentHash),
      } satisfies LoginSessionDevice;
    })
    .filter((session) => session.current || session.status === "active");
}

export async function revokeLoginSessionForUser(sessionId: string, userId: string) {
  const service = serviceOrNull();
  if (!service) return false;

  const { data, error } = await service
    .from("user_login_sessions")
    .update({
      status: "revoked",
      revoked_at: new Date().toISOString(),
      revoked_by: userId,
      revoked_reason: "user_forced_logout",
    })
    .eq("id", sessionId)
    .eq("auth_user_id", userId)
    .select("session_token_hash")
    .maybeSingle();

  return !error && Boolean(data);
}
