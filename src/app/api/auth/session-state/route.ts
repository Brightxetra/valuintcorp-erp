import { createClient } from "@supabase/supabase-js";
import { shouldUseDemoFallback } from "@/lib/auth/runtime";
import { createServiceSupabaseClient, isSupabaseServiceConfigured } from "@/lib/supabase/service";

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function createTokenSupabaseClient(authorization: string) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authorization } },
  });
}

export async function GET(request: Request) {
  if (shouldUseDemoFallback()) {
    return json({
      authenticated: false,
      runtimeMode: "demo_fallback",
      demoAccount: false,
      businessId: null,
    });
  }

  const authorization = request.headers.get("authorization");

  if (!authorization) {
    return json({ authenticated: false, runtimeMode: "production", demoAccount: false, businessId: null });
  }

  const userClient = createTokenSupabaseClient(authorization);
  const { data: userData, error: userError } = await userClient.auth.getUser();

  if (userError || !userData.user) {
    return json({ error: "Invalid or expired Supabase token." }, 401);
  }

  if (!isSupabaseServiceConfigured()) {
    return json({
      authenticated: true,
      runtimeMode: "production",
      demoAccount: false,
      businessId: null,
      user: {
        id: userData.user.id,
        email: userData.user.email,
      },
    });
  }

  const service = createServiceSupabaseClient();
  const { data: sandbox, error } = await service
    .from("demo_sandboxes")
    .select("business_id, template_id, reset_policy, seed_version, last_reset_at, next_reset_at")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();

  if (error) {
    return json({ error: error.message }, 422);
  }

  return json({
    authenticated: true,
    runtimeMode: sandbox?.business_id ? "demo_account" : "production",
    demoAccount: Boolean(sandbox?.business_id),
    businessId: sandbox?.business_id ?? null,
    user: {
      id: userData.user.id,
      email: userData.user.email,
    },
    demoSandbox: sandbox
      ? {
          businessId: sandbox.business_id,
          templateId: sandbox.template_id,
          resetPolicy: sandbox.reset_policy,
          seedVersion: sandbox.seed_version,
          lastResetAt: sandbox.last_reset_at,
          nextResetAt: sandbox.next_reset_at,
        }
      : null,
  });
}
