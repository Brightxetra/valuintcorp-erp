import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  evaluatePasswordResetRisk,
  passwordResetGenericMessage,
  recordAuthSecurityEvent,
  shouldShowCaptcha,
} from "@/lib/auth/security-events";
import { isSupabaseEnvConfigured, shouldUseDemoFallback } from "@/lib/auth/runtime";
import { authenticationConfigurationUnavailableResponse } from "@/lib/auth/configuration-response";
import { logApiWarning } from "@/lib/observability/logger";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

const forgotPasswordSchema = z.object({
  email: z.string().trim().email(),
  captchaToken: z.string().trim().min(10).optional(),
});

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

function genericResponse(extra: Record<string, unknown> = {}) {
  return json({ ok: true, message: passwordResetGenericMessage, ...extra });
}

function resetRedirectUrl(request: Request) {
  return new URL("/auth/reset-password", request.url).toString();
}

function createPasswordResetClient() {
  const config = getSupabasePublicConfig();

  if (!config) return null;

  return createClient(config.url, config.anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = forgotPasswordSchema.safeParse(payload);

  if (!parsed.success) {
    await recordAuthSecurityEvent({
      eventType: "password_reset_request",
      status: "failed",
      request,
      email: typeof payload?.email === "string" ? payload.email : undefined,
      reason: "invalid_email",
    });
    return genericResponse();
  }

  if (shouldUseDemoFallback()) {
    await recordAuthSecurityEvent({
      eventType: "password_reset_request",
      status: "failed",
      request,
      email: parsed.data.email,
      reason: "demo_fallback",
    });
    return genericResponse();
  }

  if (!isSupabaseEnvConfigured()) {
    return authenticationConfigurationUnavailableResponse();
  }

  const risk = await evaluatePasswordResetRisk(request, parsed.data.email);
  const captchaRequired = shouldShowCaptcha(risk);

  if (!risk.serviceAvailable) {
    logApiWarning("password_reset_service_role_missing", {
      route: request.url,
      action: "password_reset_request",
      status: "blocked",
    });
    await recordAuthSecurityEvent({
      eventType: "password_reset_request",
      status: "rate_limited",
      request,
      email: parsed.data.email,
      reason: risk.reason,
    });
    return genericResponse({ captchaRequired });
  }

  if (risk.hardLimited) {
    await recordAuthSecurityEvent({
      eventType: "password_reset_request",
      status: "rate_limited",
      request,
      email: parsed.data.email,
      reason: risk.reason,
    });
    logApiWarning("password_reset_rate_limited", {
      route: request.url,
      action: "password_reset_request",
      status: "rate_limited",
      details: { reason: risk.reason },
    });
    return genericResponse({ captchaRequired });
  }

  if (risk.cooldownActive) {
    await recordAuthSecurityEvent({
      eventType: "password_reset_request",
      status: "cooldown",
      request,
      email: parsed.data.email,
      reason: risk.reason,
    });
    return genericResponse({ captchaRequired, cooldownSeconds: 60 });
  }

  if (captchaRequired && !parsed.data.captchaToken) {
    await recordAuthSecurityEvent({
      eventType: "password_reset_request",
      status: "captcha_required",
      request,
      email: parsed.data.email,
      reason: risk.reason,
    });
    return genericResponse({ captchaRequired: true });
  }

  const supabase = createPasswordResetClient();

  if (!supabase) {
    await recordAuthSecurityEvent({
      eventType: "password_reset_request",
      status: "failed",
      request,
      email: parsed.data.email,
      reason: "missing_supabase_public_config",
    });
    return genericResponse({ captchaRequired });
  }

  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: resetRedirectUrl(request),
    ...(parsed.data.captchaToken ? { captchaToken: parsed.data.captchaToken } : {}),
  });

  if (error) {
    await recordAuthSecurityEvent({
      eventType: "password_reset_request",
      status: "failed",
      request,
      email: parsed.data.email,
      reason: "supabase_reset_error",
      metadata: { message: error.message },
    });
    logApiWarning("password_reset_send_failed", {
      route: request.url,
      action: "password_reset_request",
      status: "failed",
      details: { message: error.message },
    });
    return genericResponse({ captchaRequired });
  }

  await recordAuthSecurityEvent({
    eventType: "password_reset_request",
    status: "sent",
    request,
    email: parsed.data.email,
  });

  return genericResponse({ cooldownSeconds: 60 });
}
