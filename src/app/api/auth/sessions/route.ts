import { z } from "zod";
import { NextResponse } from "next/server";
import { isApiResponse, requireAuthenticatedUser } from "@/lib/auth/api";
import {
  listLoginSessionsForUser,
  revokeLoginSessionForUser,
  upsertLoginSession,
} from "@/lib/auth/login-sessions";
import {
  appendClearSessionCookies,
  nowSeconds,
  parseCookieHeader,
  requestCookie,
  rememberCookieValue,
  sessionCookieMaxAge,
  sessionCookieOptions,
} from "@/lib/auth/session-policy";
import { serverLastActivityCookie, serverSessionIdCookie, serverSessionRememberCookie } from "@/lib/auth/runtime";

const revokeSessionSchema = z.object({
  sessionId: z.string().uuid(),
});

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

function setCurrentSessionCookies(response: NextResponse, sessionToken: string, rememberMe: boolean) {
  const maxAge = sessionCookieMaxAge(rememberMe);
  response.cookies.set(serverSessionIdCookie, sessionToken, sessionCookieOptions(maxAge));
  response.cookies.set(serverSessionRememberCookie, rememberCookieValue(rememberMe), sessionCookieOptions(maxAge));
  response.cookies.set(serverLastActivityCookie, String(nowSeconds()), sessionCookieOptions(maxAge));
  return response;
}

export async function GET(request: Request) {
  const user = await requireAuthenticatedUser(request);

  if (isApiResponse(user)) return user;

  if (user.demoMode) {
    return json({
      sessions: [
        {
          id: "00000000-0000-0000-0000-000000000000",
          deviceLabel: "Demo browser",
          ipAddress: null,
          location: null,
          userAgent: null,
          rememberMe: false,
          status: "active",
          createdAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
          expiresAt: null,
          revokedAt: null,
          current: true,
        },
      ],
    });
  }

  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const rememberMe = cookies.get(serverSessionRememberCookie) === "1";
  const sessionToken = requestCookie(request, serverSessionIdCookie) ?? crypto.randomUUID();

  await upsertLoginSession({
    request,
    sessionToken,
    userId: user.userId,
    rememberMe,
  });

  return setCurrentSessionCookies(
    json({
      sessions: await listLoginSessionsForUser(user.userId, sessionToken),
    }),
    sessionToken,
    rememberMe,
  );
}

export async function DELETE(request: Request) {
  const user = await requireAuthenticatedUser(request);

  if (isApiResponse(user)) return user;

  const payload = await request.json().catch(() => null);
  const parsed = revokeSessionSchema.safeParse(payload);

  if (!parsed.success) {
    return json({ errors: parsed.error.flatten() }, 400);
  }

  const sessions = await listLoginSessionsForUser(user.userId, requestCookie(request, serverSessionIdCookie));
  const target = sessions.find((session) => session.id === parsed.data.sessionId);

  if (!target) {
    return json({ error: "Sesi login tidak ditemukan." }, 404);
  }

  const revoked = await revokeLoginSessionForUser(parsed.data.sessionId, user.userId);

  if (!revoked) {
    return json({ error: "Sesi login gagal dikeluarkan." }, 422);
  }

  const response = json({ ok: true, current: target.current });

  if (target.current) {
    appendClearSessionCookies(response);
  }

  return response;
}
