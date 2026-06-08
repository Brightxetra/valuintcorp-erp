import { z } from "zod";
import { isApiResponse, requireApiPermission, withDemoHeader } from "@/lib/auth/api";
import { getDemoErpStore } from "@/lib/erp/demo-store";
import { loadSupabaseWorkspace } from "@/lib/erp/workspace-repository";
import { logApiError, logApiInfo } from "@/lib/observability/logger";
import { createRequestSupabaseClient } from "@/lib/supabase/server";

const memberSchema = z.object({
  authUserId: z.string().uuid().optional(),
  email: z.string().email().optional(),
  role: z.enum(["owner", "finance_admin", "staff", "hr", "external_advisor", "system_admin"]),
}).refine((value) => value.authUserId || value.email, {
  message: "Email invite atau Supabase auth user id wajib diisi.",
  path: ["email"],
});

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const context = await requireApiPermission(request, "admin:manage_users");

  if (isApiResponse(context)) {
    return context;
  }

  const payload = await request.json().catch(() => null);
  const parsed = memberSchema.safeParse(payload);

  if (!parsed.success) {
    return withDemoHeader(json({ errors: parsed.error.flatten() }, 400), context);
  }

  if (context.demoMode) {
    logApiInfo("erp.member.save.demo", {
      businessId: context.businessId,
      userId: context.userId,
      route: "/api/erp/members",
      details: { role: parsed.data.role, inviteEmail: parsed.data.email },
    });
    return withDemoHeader(json({ workspace: getDemoErpStore() }, 201), context);
  }

  const supabase = createRequestSupabaseClient(request);

  if (parsed.data.authUserId) {
    const { error } = await supabase.from("business_members").upsert(
      {
        business_id: context.businessId,
        auth_user_id: parsed.data.authUserId,
        role: parsed.data.role,
      },
      { onConflict: "business_id,auth_user_id" },
    );

    if (error) {
      logApiError("erp.member.upsert.failed", error, {
        businessId: context.businessId,
        userId: context.userId,
        route: "/api/erp/members",
        details: { targetUserId: parsed.data.authUserId, role: parsed.data.role },
      });
      return withDemoHeader(json({ error: error.message }, 422), context);
    }

    logApiInfo("erp.member.upsert.succeeded", {
      businessId: context.businessId,
      userId: context.userId,
      route: "/api/erp/members",
      details: { targetUserId: parsed.data.authUserId, role: parsed.data.role },
    });

    return withDemoHeader(json({ workspace: await loadSupabaseWorkspace(supabase, context) }, 201), context);
  }

  const { error } = await supabase.from("member_invites").insert({
    business_id: context.businessId,
    email: parsed.data.email?.toLowerCase(),
    role: parsed.data.role,
    status: "pending",
    invited_by: context.userId,
    expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
  });

  if (error) {
    logApiError("erp.member.invite.failed", error, {
      businessId: context.businessId,
      userId: context.userId,
      route: "/api/erp/members",
      details: { email: parsed.data.email, role: parsed.data.role },
    });
    return withDemoHeader(json({ error: error.message }, 422), context);
  }

  logApiInfo("erp.member.invite.created", {
    businessId: context.businessId,
    userId: context.userId,
    route: "/api/erp/members",
    details: { email: parsed.data.email, role: parsed.data.role },
  });

  return withDemoHeader(json({ invite: { email: parsed.data.email, role: parsed.data.role }, workspace: await loadSupabaseWorkspace(supabase, context) }, 201), context);
}
