import { z } from "zod";
import { isApiResponse, requireApiPermission, withDemoHeader } from "@/lib/auth/api";
import { getDemoErpStore } from "@/lib/erp/demo-store";
import { loadSupabaseWorkspace } from "@/lib/erp/workspace-repository";
import { logApiError, logApiInfo } from "@/lib/observability/logger";
import { createRequestSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient, isSupabaseServiceConfigured } from "@/lib/supabase/service";
import { permissionCatalog, type Permission } from "@/lib/security/permissions";
import { findAuthUserByEmail, normalizeInviteEmail } from "@/lib/auth/member-invites";

const permissionSchema = z.string().refine((value): value is Permission => permissionCatalog.some((entry) => entry.permission === value), "Izin tidak dikenal.");

const memberSchema = z.object({
  memberId: z.string().uuid().optional(),
  accessScope: z.enum(["role", "custom"]).default("role"),
  permissions: z.array(permissionSchema).default([]),
  locationIds: z.array(z.string().uuid()).default([]),
  email: z.string().email().optional(),
  role: z.enum(["owner", "finance_admin", "staff", "hr", "external_advisor", "system_admin"]),
}).refine((value) => value.memberId || value.email, {
  message: "Email anggota wajib diisi.",
  path: ["email"],
});

const deleteMemberSchema = z.object({
  memberId: z.string().uuid().optional(),
  inviteId: z.string().uuid().optional(),
}).refine((value) => value.memberId || value.inviteId, {
  message: "Pilih anggota atau invite yang akan dihapus.",
});

const resendInviteSchema = z.object({
  inviteId: z.string().uuid(),
});

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function inviteRedirectUrl(request: Request) {
  const url = new URL("/login", request.url);
  url.searchParams.set("next", "/dashboard");
  return url.toString();
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

  const accessScope = parsed.data.role === "owner" || parsed.data.role === "system_admin" ? "role" : parsed.data.accessScope;
  const permissionSet = new Set(parsed.data.permissions);
  if (permissionSet.has("pos:sell") || permissionSet.has("pos:expenses")) permissionSet.add("pos:read");
  const accessPermissions = accessScope === "custom" ? [...permissionSet] : [];
  const locationIds = [...new Set(parsed.data.locationIds)];
  const customPosAccess = accessScope === "custom" && accessPermissions.some((permission) => permission.startsWith("pos:"));
  if (customPosAccess && locationIds.length === 0) {
    return withDemoHeader(json({ error: "Akses POS spesifik harus memiliki minimal satu cabang." }, 400), context);
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

  if (locationIds.length > 0) {
    const { data: locations, error: locationError } = await supabase
      .from("locations")
      .select("id")
      .eq("business_id", context.businessId)
      .eq("is_active", true)
      .in("type", ["branch", "outlet", "store"])
      .in("id", locationIds);

    if (locationError) {
      return withDemoHeader(json({ error: locationError.message }, 422), context);
    }

    if ((locations ?? []).length !== locationIds.length) {
      return withDemoHeader(json({ error: "Cabang yang dipilih tidak valid untuk bisnis ini." }, 422), context);
    }
  }

  if (parsed.data.memberId) {
    const { data: updatedMember, error } = await supabase
      .from("business_members")
      .update({
        role: parsed.data.role,
        access_scope: accessScope,
        access_permissions: accessPermissions,
        location_ids: locationIds,
      })
      .eq("business_id", context.businessId)
      .eq("id", parsed.data.memberId)
      .select("id")
      .maybeSingle();

    if (error) {
      logApiError("erp.member.upsert.failed", error, {
        businessId: context.businessId,
        userId: context.userId,
        route: "/api/erp/members",
        details: { memberId: parsed.data.memberId, role: parsed.data.role },
      });
      return withDemoHeader(json({ error: error.message }, 422), context);
    }

    if (!updatedMember?.id) {
      return withDemoHeader(json({ error: "Anggota tidak ditemukan." }, 404), context);
    }

    logApiInfo("erp.member.upsert.succeeded", {
      businessId: context.businessId,
      userId: context.userId,
      route: "/api/erp/members",
      details: { memberId: parsed.data.memberId, role: parsed.data.role },
    });

    return withDemoHeader(json({ workspace: await loadSupabaseWorkspace(supabase, context) }, 201), context);
  }

  if (!isSupabaseServiceConfigured()) {
    return withDemoHeader(json({ error: "Supabase service role key wajib dikonfigurasi agar invite email bisa dikirim." }, 503), context);
  }

  const email = normalizeInviteEmail(parsed.data.email ?? "");
  const { data: pendingInvite, error: pendingInviteError } = await supabase
    .from("member_invites")
    .select("id")
    .eq("business_id", context.businessId)
    .eq("email", email)
    .eq("status", "pending")
    .maybeSingle();

  if (pendingInviteError) {
    return withDemoHeader(json({ error: pendingInviteError.message }, 422), context);
  }

  if (pendingInvite?.id) {
    return withDemoHeader(json({ error: "Invite untuk email ini masih pending. Batalkan invite lama sebelum mengirim ulang." }, 409), context);
  }

  const service = createServiceSupabaseClient();
  const existingAuthUser = await findAuthUserByEmail(service, email);

  if (existingAuthUser) {
    const { error } = await supabase.from("business_members").upsert(
      {
        business_id: context.businessId,
        auth_user_id: existingAuthUser.id,
        role: parsed.data.role,
        access_scope: accessScope,
        access_permissions: accessPermissions,
        location_ids: locationIds,
      },
      { onConflict: "business_id,auth_user_id" },
    );

    if (error) {
      logApiError("erp.member.upsert.failed", error, {
        businessId: context.businessId,
        userId: context.userId,
        route: "/api/erp/members",
        details: { targetEmail: email, targetUserId: existingAuthUser.id, role: parsed.data.role },
      });
      return withDemoHeader(json({ error: error.message }, 422), context);
    }

    await supabase
      .from("member_invites")
      .update({
        status: "accepted",
        accepted_by: existingAuthUser.id,
        accepted_at: new Date().toISOString(),
      })
      .eq("business_id", context.businessId)
      .eq("email", email)
      .eq("status", "pending");

    logApiInfo("erp.member.existing_user_added", {
      businessId: context.businessId,
      userId: context.userId,
      route: "/api/erp/members",
      details: { targetEmail: email, targetUserId: existingAuthUser.id, role: parsed.data.role },
    });

    return withDemoHeader(json({
      member: { email, existingUser: true },
      workspace: await loadSupabaseWorkspace(supabase, context),
    }, 201), context);
  }

  const { data: createdInvite, error } = await supabase.from("member_invites").insert({
    business_id: context.businessId,
    email,
    role: parsed.data.role,
    access_scope: accessScope,
    access_permissions: accessPermissions,
    location_ids: locationIds,
    status: "pending",
    invited_by: context.userId,
    expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
  }).select("id").single();

  if (error) {
    logApiError("erp.member.invite.failed", error, {
      businessId: context.businessId,
      userId: context.userId,
      route: "/api/erp/members",
      details: { email, role: parsed.data.role },
    });
    return withDemoHeader(json({ error: error.message }, 422), context);
  }

  const invited = await service.auth.admin.inviteUserByEmail(email, {
    redirectTo: inviteRedirectUrl(request),
    data: {
      invited_by: context.userId,
      business_id: context.businessId,
      business_role: parsed.data.role,
    },
  });

  if (invited.error) {
    if (createdInvite?.id) {
      await supabase.from("member_invites").update({ status: "revoked" }).eq("id", createdInvite.id);
    }

    logApiError("erp.member.auth_invite.failed", invited.error, {
      businessId: context.businessId,
      userId: context.userId,
      route: "/api/erp/members",
      details: { email, role: parsed.data.role },
    });
    return withDemoHeader(json({ error: invited.error.message }, 422), context);
  }

  logApiInfo("erp.member.invite.created", {
    businessId: context.businessId,
    userId: context.userId,
    route: "/api/erp/members",
    details: { email, role: parsed.data.role },
  });

  return withDemoHeader(json({ invite: { email, role: parsed.data.role, emailSent: true }, workspace: await loadSupabaseWorkspace(supabase, context) }, 201), context);
}

export async function PATCH(request: Request) {
  const context = await requireApiPermission(request, "admin:manage_users");

  if (isApiResponse(context)) {
    return context;
  }

  const payload = await request.json().catch(() => null);
  const parsed = resendInviteSchema.safeParse(payload);

  if (!parsed.success) {
    return withDemoHeader(json({ errors: parsed.error.flatten() }, 400), context);
  }

  if (context.demoMode) {
    return withDemoHeader(json({ workspace: getDemoErpStore(), invite: { resent: true } }), context);
  }

  if (!isSupabaseServiceConfigured()) {
    return withDemoHeader(json({ error: "Supabase service role key wajib dikonfigurasi agar invite email bisa dikirim." }, 503), context);
  }

  const supabase = createRequestSupabaseClient(request);
  const { data: invite, error: inviteError } = await supabase
    .from("member_invites")
    .select("id, email, role, access_scope, access_permissions, location_ids")
    .eq("business_id", context.businessId)
    .eq("id", parsed.data.inviteId)
    .eq("status", "pending")
    .maybeSingle();

  if (inviteError) {
    return withDemoHeader(json({ error: inviteError.message }, 422), context);
  }

  if (!invite?.id || !invite.email || !invite.role) {
    return withDemoHeader(json({ error: "Invite pending tidak ditemukan atau sudah tidak aktif." }, 404), context);
  }

  const service = createServiceSupabaseClient();
  const email = normalizeInviteEmail(invite.email);
  const existingAuthUser = await findAuthUserByEmail(service, email);
  const accessScope = invite.access_scope === "custom" ? "custom" : "role";
  const accessPermissions = Array.isArray(invite.access_permissions)
    ? invite.access_permissions.filter((permission): permission is Permission => typeof permission === "string")
    : [];
  const locationIds = Array.isArray(invite.location_ids)
    ? invite.location_ids.filter((locationId): locationId is string => typeof locationId === "string")
    : [];

  if (existingAuthUser) {
    const { error: memberError } = await supabase.from("business_members").upsert(
      {
        business_id: context.businessId,
        auth_user_id: existingAuthUser.id,
        role: invite.role,
        access_scope: accessScope,
        access_permissions: accessPermissions,
        location_ids: locationIds,
      },
      { onConflict: "business_id,auth_user_id" },
    );

    if (memberError) {
      return withDemoHeader(json({ error: memberError.message }, 422), context);
    }

    await supabase
      .from("member_invites")
      .update({
        status: "accepted",
        accepted_by: existingAuthUser.id,
        accepted_at: new Date().toISOString(),
      })
      .eq("id", invite.id);

    return withDemoHeader(json({
      member: { email, existingUser: true },
      workspace: await loadSupabaseWorkspace(supabase, context),
    }), context);
  }

  const resent = await service.auth.admin.inviteUserByEmail(email, {
    redirectTo: inviteRedirectUrl(request),
    data: {
      invited_by: context.userId,
      business_id: context.businessId,
      business_role: invite.role,
    },
  });

  if (resent.error) {
    return withDemoHeader(json({ error: resent.error.message }, 422), context);
  }

  await supabase
    .from("member_invites")
    .update({
      expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .eq("id", invite.id);

  return withDemoHeader(json({ invite: { email, role: invite.role, resent: true }, workspace: await loadSupabaseWorkspace(supabase, context) }), context);
}

export async function DELETE(request: Request) {
  const context = await requireApiPermission(request, "admin:manage_users");

  if (isApiResponse(context)) {
    return context;
  }

  const payload = await request.json().catch(() => null);
  const parsed = deleteMemberSchema.safeParse(payload);

  if (!parsed.success) {
    return withDemoHeader(json({ errors: parsed.error.flatten() }, 400), context);
  }

  if (context.demoMode) {
    return withDemoHeader(json({ workspace: getDemoErpStore() }), context);
  }

  const supabase = createRequestSupabaseClient(request);

  if (parsed.data.inviteId) {
    const { data, error } = await supabase
      .from("member_invites")
      .update({ status: "revoked" })
      .eq("business_id", context.businessId)
      .eq("id", parsed.data.inviteId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (error) {
      return withDemoHeader(json({ error: error.message }, 422), context);
    }

    if (!data?.id) {
      return withDemoHeader(json({ error: "Invite pending tidak ditemukan atau sudah tidak aktif." }, 404), context);
    }

    return withDemoHeader(json({ workspace: await loadSupabaseWorkspace(supabase, context) }), context);
  }

  const { data: member, error: memberError } = await supabase
    .from("business_members")
    .select("id, auth_user_id, role")
    .eq("business_id", context.businessId)
    .eq("id", parsed.data.memberId)
    .maybeSingle();

  if (memberError) {
    return withDemoHeader(json({ error: memberError.message }, 422), context);
  }

  if (!member?.id || !member.auth_user_id) {
    return withDemoHeader(json({ error: "Anggota tidak ditemukan." }, 404), context);
  }

  if (member.auth_user_id === context.userId) {
    return withDemoHeader(json({ error: "Anda tidak bisa menghapus akses akun sendiri dari panel ini." }, 400), context);
  }

  if (member.role === "owner") {
    return withDemoHeader(json({ error: "Owner bisnis tidak bisa dihapus dari panel ini." }, 400), context);
  }

  const { error } = await supabase
    .from("business_members")
    .delete()
    .eq("business_id", context.businessId)
    .eq("id", parsed.data.memberId);

  if (error) {
    return withDemoHeader(json({ error: error.message }, 422), context);
  }

  if (isSupabaseServiceConfigured()) {
    await createServiceSupabaseClient()
      .from("user_login_sessions")
      .update({
        status: "revoked",
        revoked_at: new Date().toISOString(),
        revoked_by: context.userId,
        revoked_reason: "member_removed",
      })
      .eq("auth_user_id", member.auth_user_id)
      .eq("status", "active");
  }

  return withDemoHeader(json({ workspace: await loadSupabaseWorkspace(supabase, context) }), context);
}
