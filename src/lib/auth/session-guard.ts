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
import { getLoginSessionStatus } from "@/lib/auth/login-sessions";

export interface SessionGuardOk {
  ok: true;
  rememberMe: boolean;
  sessionToken: string | null;
}

export interface SessionGuardDenied {
  ok: false;
  reason: SessionEndReason;
  response: Response;
}

export type SessionGuardResult = SessionGuardOk | SessionGuardDenied;

export async function validateRequestSession(request: Request): Promise<SessionGuardResult> {
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

  const status = await getLoginSessionStatus(sessionToken);

  if (status === "revoked") {
    return {
      ok: false,
      reason: "session-revoked",
      response: sessionEndedResponse("session-revoked"),
    };
  }

  if (status === "expired") {
    return {
      ok: false,
      reason: "session-expired",
      response: sessionEndedResponse("session-expired"),
    };
  }

  return { ok: true, rememberMe, sessionToken };
}
