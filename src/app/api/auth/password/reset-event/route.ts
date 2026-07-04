import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAuthSecurityEvent } from "@/lib/auth/security-events";

export const dynamic = "force-dynamic";

const resetEventSchema = z.object({
  status: z.enum(["invalid_callback", "limited_attempt", "completed"]),
  email: z.string().trim().email().optional(),
  reason: z.string().trim().max(200).optional(),
});

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = resetEventSchema.safeParse(payload);

  if (!parsed.success) {
    return json({ ok: true });
  }

  await recordAuthSecurityEvent({
    eventType: parsed.data.status === "completed" ? "password_reset_complete" : "password_reset_recovery",
    status: parsed.data.status,
    request,
    email: parsed.data.email,
    reason: parsed.data.reason,
  });

  return json({ ok: true });
}
