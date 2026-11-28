import { createHmac } from "node:crypto";
import { createServiceSupabaseClient, isSupabaseServiceConfigured } from "@/lib/supabase/service";
import { logApiWarning } from "@/lib/observability/logger";

export const passwordResetGenericMessage = "Jika email terdaftar, instruksi reset akan dikirim.";

export type AuthSecurityEventType =
  | "password_reset_request"
  | "password_reset_recovery"
  | "password_reset_complete";

export type AuthSecurityEventStatus =
  | "sent"
  | "captcha_required"
  | "cooldown"
  | "rate_limited"
  | "failed"
  | "invalid_callback"
  | "limited_attempt"
  | "completed";

export interface RequestFingerprint {
  ipHash: string;
  userAgentHash?: string;
}

export interface PasswordResetRiskResult {
  emailHash: string;
  emailDomain?: string;
  fingerprint: RequestFingerprint;
  captchaRequired: boolean;
  hardLimited: boolean;
  cooldownActive: boolean;
  serviceAvailable: boolean;
  reason?: string;
}

interface AuthSecurityEventInput {
  eventType: AuthSecurityEventType;
  status: AuthSecurityEventStatus;
  request: Request;
  email?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

const minuteMs = 60_000;
const hourMs = 60 * minuteMs;
const dayMs = 24 * hourMs;
const passwordResetCooldownMs = minuteMs;
const emailHourlyLimit = 3;
const emailDailyLimit = 10;
const ipHourlyLimit = 10;
const ipDailyLimit = 30;
const emailCaptchaThreshold = 2;
const ipCaptchaThreshold = 5;

function hashSecret() {
  return (
    process.env.AUTH_SECURITY_EVENT_SALT ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "valuintcorp-auth-security-development-salt"
  );
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function emailDomain(value: string) {
  const domain = normalizeEmail(value).split("@")[1]?.trim();
  return domain || undefined;
}

export function securityHash(value: string) {
  return createHmac("sha256", hashSecret()).update(value).digest("hex");
}

function requestIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (
    forwardedFor ||
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

export function fingerprintRequest(request: Request): RequestFingerprint {
  const userAgent = request.headers.get("user-agent")?.trim();

  return {
    ipHash: securityHash(requestIp(request)),
    userAgentHash: userAgent ? securityHash(userAgent) : undefined,
  };
}
function nowMinus(ms: number) {
  return new Date(Date.now() - ms).toISOString();
}

function countSince(rows: Array<{ created_at?: string | null }>, ms: number) {
  const cutoff = Date.now() - ms;
  return rows.filter((row) => {
    const createdAt = row.created_at ? new Date(row.created_at).getTime() : 0;
    return Number.isFinite(createdAt) && createdAt >= cutoff;
  }).length;
}

function newestEventAgeMs(rows: Array<{ created_at?: string | null }>) {
  const newest = rows.reduce((current, row) => {
    const createdAt = row.created_at ? new Date(row.created_at).getTime() : 0;
    return Math.max(current, Number.isFinite(createdAt) ? createdAt : 0);
  }, 0);

  return newest > 0 ? Date.now() - newest : Number.POSITIVE_INFINITY;
}

export async function recordAuthSecurityEvent(input: AuthSecurityEventInput) {
  const fingerprint = fingerprintRequest(input.request);
  const normalizedEmail = input.email ? normalizeEmail(input.email) : undefined;

  if (!isSupabaseServiceConfigured()) {
    logApiWarning("auth_security_event_not_recorded", {
      route: input.request.url,
      action: input.eventType,
      status: input.status,
      details: { reason: "Supabase service role is not configured." },
    });
    return { recorded: false, fingerprint };
  }

  const service = createServiceSupabaseClient();
  const { error } = await service.from("auth_security_events").insert({
    event_type: input.eventType,
    email_hash: normalizedEmail ? securityHash(normalizedEmail) : null,
    email_domain: normalizedEmail ? emailDomain(normalizedEmail) ?? null : null,
    ip_hash: fingerprint.ipHash,
    user_agent_hash: fingerprint.userAgentHash ?? null,
    status: input.status,
    reason: input.reason ?? null,
    metadata: input.metadata ?? {},
  });

  if (error) {
    logApiWarning("auth_security_event_insert_failed", {
      route: input.request.url,
      action: input.eventType,
      status: input.status,
      details: { error: error.message },
    });
  }

  return { recorded: !error, fingerprint };
}

export async function evaluatePasswordResetRisk(
  request: Request,
  email: string,
): Promise<PasswordResetRiskResult> {
  const normalizedEmail = normalizeEmail(email);
  const emailHash = securityHash(normalizedEmail);
  const fingerprint = fingerprintRequest(request);
  const domain = emailDomain(normalizedEmail);

  if (!isSupabaseServiceConfigured()) {
    return {
      emailHash,
      emailDomain: domain,
      fingerprint,
      captchaRequired: false,
      hardLimited: true,
      cooldownActive: false,
      serviceAvailable: false,
      reason: "service_not_configured",
    };
  }

  const service = createServiceSupabaseClient();
  const since = nowMinus(dayMs);
  const [emailEvents, ipEvents] = await Promise.all([
    service
      .from("auth_security_events")
      .select("created_at,status")
      .eq("event_type", "password_reset_request")
      .eq("email_hash", emailHash)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(100),
    service
      .from("auth_security_events")
      .select("created_at,status")
      .eq("event_type", "password_reset_request")
      .eq("ip_hash", fingerprint.ipHash)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  if (emailEvents.error || ipEvents.error) {
    logApiWarning("password_reset_rate_limit_lookup_failed", {
      route: request.url,
      action: "password_reset_request",
      details: {
        emailLookup: emailEvents.error?.message,
        ipLookup: ipEvents.error?.message,
      },
    });
    return {
      emailHash,
      emailDomain: domain,
      fingerprint,
      captchaRequired: true,
      hardLimited: true,
      cooldownActive: false,
      serviceAvailable: true,
      reason: "rate_limit_lookup_failed",
    };
  }

  const emailRows = emailEvents.data ?? [];
  const ipRows = ipEvents.data ?? [];
  const emailHour = countSince(emailRows, hourMs);
  const emailDay = emailRows.length;
  const ipHour = countSince(ipRows, hourMs);
  const ipDay = ipRows.length;
  const cooldownActive = newestEventAgeMs(emailRows.filter((row) => row.status === "sent")) < passwordResetCooldownMs;
  const hardLimited =
    emailHour >= emailHourlyLimit ||
    emailDay >= emailDailyLimit ||
    ipHour >= ipHourlyLimit ||
    ipDay >= ipDailyLimit;
  const captchaRequired = emailHour >= emailCaptchaThreshold || ipHour >= ipCaptchaThreshold;
  const reason =
    hardLimited
      ? "rate_limited"
      : cooldownActive
        ? "cooldown"
        : captchaRequired
          ? "suspicious_activity"
          : undefined;

  return {
    emailHash,
    emailDomain: domain,
    fingerprint,
    captchaRequired,
    hardLimited,
    cooldownActive,
    serviceAvailable: true,
    reason,
  };
}
