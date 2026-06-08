import { z } from "zod";
import { createServiceSupabaseClient, isSupabaseServiceConfigured } from "@/lib/supabase/service";

const resetSchema = z.object({
  businessId: z.string().uuid().optional(),
});

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret) return false;

  const authorization = request.headers.get("authorization");
  const cronSecret = request.headers.get("x-cron-secret");

  return authorization === `Bearer ${secret}` || cronSecret === secret;
}

async function resetDue(request: Request) {
  if (!authorized(request)) {
    return json({ error: "Unauthorized demo reset request." }, 401);
  }

  if (!isSupabaseServiceConfigured()) {
    return json({ error: "SUPABASE_SERVICE_ROLE_KEY is required for demo reset." }, 500);
  }

  const service = createServiceSupabaseClient();
  const { data, error } = await service.rpc("reset_due_demo_sandboxes");

  if (error) {
    return json({ error: error.message }, 422);
  }

  const rows = Array.isArray(data) ? data : [];

  return json({
    reset: rows.map((row) => ({
      businessId: row.business_id,
      authUserId: row.auth_user_id,
      resetAt: row.reset_at,
    })),
  });
}

export async function GET(request: Request) {
  return resetDue(request);
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return json({ error: "Unauthorized demo reset request." }, 401);
  }

  if (!isSupabaseServiceConfigured()) {
    return json({ error: "SUPABASE_SERVICE_ROLE_KEY is required for demo reset." }, 500);
  }

  const payload = await request.json().catch(() => ({}));
  const parsed = resetSchema.safeParse(payload);

  if (!parsed.success) {
    return json({ errors: parsed.error.flatten() }, 400);
  }

  const service = createServiceSupabaseClient();

  if (parsed.data.businessId) {
    const { data, error } = await service.rpc("reset_demo_sandbox", {
      target_business_id: parsed.data.businessId,
    });

    if (error) {
      return json({ error: error.message }, 422);
    }

    return json({ reset: [{ businessId: data, resetAt: new Date().toISOString() }] });
  }

  return resetDue(request);
}
