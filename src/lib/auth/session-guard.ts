import {
  serverLastActivityCookie,
  serverSessionIdCookie,
} from "@/lib/auth/runtime";
import {
  isIdleSessionExpired,
  isRememberedSessionFromCookies,
  parseCookieHeader,
  sessionEndedResponse,
  type SessionEndReason,
} from "@/lib/auth/session-policy";
import { getLoginSessionBinding } from "@/lib/auth/login-sessions";
import type { VerifiedSupabaseSessionIdentity } from "@/lib/auth/token";

export interface SessionGuardOk {
  ok: true;
  rememberMe: boolean;
  sessionToken: string;
  userId: string;
  supabaseSessionId: string;
}

export interface SessionGuardDenied {
  ok: false;
  reason: SessionEndReason;
  response: Response;
}

export type SessionGuardResult = SessionGuardOk | SessionGuardDenied;

export async function validateRequestSession(
  request: Request,
  identity: VerifiedSupabaseSessionIdentity,
): Promise<SessionGuardResult> {
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const rememberMe = isRememberedSessionFromCookies(cookies);
  const lastActivity = Number(cookies.get(serverLastActivityCookie) ?? "");

  if (isIdleSessionExpired(Number.isFinite(lastActivity) ? lastActivity : null, rememberMe)) {
    return {
      ok: false,
      reason: "session-expired",
      response: sessionEndedResponse("session-expired"),
    };
  }

  const sessionToken = cookies.get(serverSessionIdCookie) ?? null;

  if (!sessionToken) {
    return {
      ok: false,
      reason: "session-expired",
      response: sessionEndedResponse("session-expired"),
    };
  }

  const binding = await getLoginSessionBinding(sessionToken);

  if (
    binding.state === "revoked" ||
    (binding.state === "active" &&
      (binding.userId !== identity.userId ||
        binding.supabaseSessionId !== identity.sessionId))
  ) {
    return {
      ok: false,
      reason: "session-revoked",
      response: sessionEndedResponse("session-revoked"),
    };
  }

  if (binding.state !== "active") {
    return {
      ok: false,
      reason: "session-expired",
      response: sessionEndedResponse("session-expired"),
    };
  }

  return {
    ok: true,
    rememberMe,
    sessionToken,
    userId: binding.userId,
    supabaseSessionId: binding.supabaseSessionId,
  };
}
