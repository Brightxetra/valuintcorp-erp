import { z } from "zod";
import { isApiResponse, requireAuthenticatedUser } from "@/lib/auth/api";
import {
  listLoginSessionsForUser,
  revokeLoginSessionForUser,
} from "@/lib/auth/login-sessions";
import {
  appendClearSessionCookies,
  requestCookie,
} from "@/lib/auth/session-policy";
import { serverSessionIdCookie } from "@/lib/auth/runtime";

const revokeSessionSchema = z.object({
  sessionId: z.string().uuid(),
});

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
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

  return json({
    sessions: await listLoginSessionsForUser(user.userId, requestCookie(request, serverSessionIdCookie)),
  });
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
