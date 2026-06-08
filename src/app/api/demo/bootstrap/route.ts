import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { shouldUseDemoFallback } from "@/lib/auth/runtime";
import { createServiceSupabaseClient, isSupabaseServiceConfigured } from "@/lib/supabase/service";

const bootstrapSchema = z.object({
  templateId: z.string().min(2).optional(),
});

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function demoLoginEnabled() {
  return process.env.NEXT_PUBLIC_DEMO_LOGIN_ENABLED === "true";
}

function createTokenSupabaseClient(authorization: string) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authorization } },
  });
}

export async function POST(request: Request) {
  if (shouldUseDemoFallback()) {
    return json({ runtimeMode: "demo_fallback", demoAccount: false, businessId: null });
  }

  if (!demoLoginEnabled()) {
    return json({ runtimeMode: "production", demoAccount: false, businessId: null });
  }

  if (!isSupabaseServiceConfigured()) {
    return json({
      runtimeMode: "production",
      demoAccount: false,
      businessId: null,
      warning: "SUPABASE_SERVICE_ROLE_KEY is required for demo account bootstrap.",
    });
  }

  const authorization = request.headers.get("authorization");

  if (!authorization) {
    return json({ error: "Authorization bearer token is required." }, 401);
  }

  const payload = await request.json().catch(() => ({}));
  const parsed = bootstrapSchema.safeParse(payload);

  if (!parsed.success) {
    return json({ errors: parsed.error.flatten() }, 400);
  }

  const userClient = createTokenSupabaseClient(authorization);
  const { data: userData, error: userError } = await userClient.auth.getUser();

  if (userError || !userData.user) {
    return json({ error: "Invalid or expired Supabase token." }, 401);
  }

  const userEmail = userData.user.email?.toLowerCase();

  if (!userEmail) {
    return json({ runtimeMode: "production", demoAccount: false, businessId: null });
  }

  const service = createServiceSupabaseClient();
  const { data: accountByUserId, error: userAccountError } = await service
    .from("demo_user_accounts")
    .select("id, email, role, template_id, reset_policy, seed_version, enabled")
    .eq("enabled", true)
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();

  if (userAccountError) {
    return json({ error: userAccountError.message }, 422);
  }

  const { data: accountByEmail, error: emailAccountError } = accountByUserId
    ? { data: null, error: null }
    : await service
        .from("demo_user_accounts")
        .select("id, email, role, template_id, reset_policy, seed_version, enabled")
        .eq("enabled", true)
        .eq("email", userEmail)
        .maybeSingle();

  if (emailAccountError) {
    return json({ error: emailAccountError.message }, 422);
  }

  const account = accountByUserId ?? accountByEmail;

  if (!account?.id) {
    return json({ runtimeMode: "production", demoAccount: false, businessId: null });
  }

  const templateId = parsed.data.templateId ?? String(account.template_id ?? "food_beverage");
  const { data: businessId, error } = await service.rpc("bootstrap_demo_sandbox", {
    target_auth_user_id: userData.user.id,
    target_email: userEmail,
    requested_template_id: templateId,
    requested_role: String(account.role ?? "owner"),
    requested_seed_version: Number(account.seed_version ?? 1),
    requested_reset_policy: String(account.reset_policy ?? "daily"),
  });

  if (error) {
    return json({ error: error.message }, 422);
  }

  return json({
    runtimeMode: "demo_account",
    demoAccount: true,
    businessId,
    templateId,
  });
}
