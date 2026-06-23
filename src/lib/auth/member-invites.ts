import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { BusinessRole } from "@/lib/domain/types";
import type { MemberAccessScope } from "@/lib/erp/types";
import type { Permission } from "@/lib/security/permissions";

export interface AuthUserSummary {
  id: string;
  email?: string;
  name?: string;
  emailConfirmedAt?: string;
  invitedAt?: string;
  lastSignInAt?: string;
}

interface PendingInviteRow {
  id?: string;
  business_id?: string;
  role?: BusinessRole;
  access_scope?: MemberAccessScope;
  access_permissions?: unknown;
  location_ids?: unknown;
}

export function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase();
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function summarizeAuthUser(user: User): AuthUserSummary {
  return {
    id: user.id,
    email: user.email ?? undefined,
    name:
      typeof user.user_metadata?.name === "string"
        ? user.user_metadata.name
        : user.email ?? undefined,
    emailConfirmedAt: user.email_confirmed_at ?? user.confirmed_at ?? undefined,
    invitedAt: user.invited_at ?? undefined,
    lastSignInAt: user.last_sign_in_at ?? undefined,
  };
}

export async function findAuthUserByEmail(
  service: SupabaseClient,
  email: string,
): Promise<AuthUserSummary | null> {
  const normalizedEmail = normalizeInviteEmail(email);
  let page = 1;

  while (page <= 20) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 1000 });

    if (error) {
      throw new Error(error.message);
    }

    const user = data.users.find((candidate) => normalizeInviteEmail(candidate.email ?? "") === normalizedEmail);
    if (user) return summarizeAuthUser(user);
    if (!data.nextPage) return null;
    page = data.nextPage;
  }

  return null;
}

export async function authUserSummariesById(
  service: SupabaseClient,
  authUserIds: readonly string[],
): Promise<Map<string, AuthUserSummary>> {
  const summaries = new Map<string, AuthUserSummary>();
  const uniqueIds = [...new Set(authUserIds.filter(Boolean))];

  await Promise.all(
    uniqueIds.map(async (authUserId) => {
      const { data, error } = await service.auth.admin.getUserById(authUserId);
      if (!error && data.user) {
        summaries.set(authUserId, summarizeAuthUser(data.user));
      }
    }),
  );

  return summaries;
}

export async function acceptPendingMemberInvitesForUser(
  service: SupabaseClient,
  user: Pick<User, "id" | "email">,
): Promise<number> {
  const normalizedEmail = normalizeInviteEmail(user.email ?? "");
  if (!user.id || !normalizedEmail) return 0;

  const { data, error } = await service
    .from("member_invites")
    .select("id, business_id, role, access_scope, access_permissions, location_ids")
    .eq("email", normalizedEmail)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString());

  if (error) {
    throw new Error(error.message);
  }

  const invites = (data ?? []) as PendingInviteRow[];
  let acceptedCount = 0;

  for (const invite of invites) {
    if (!invite.id || !invite.business_id || !invite.role) continue;

    const accessScope = invite.access_scope === "custom" ? "custom" : "role";
    const accessPermissions = stringArray(invite.access_permissions) as Permission[];
    const locationIds = stringArray(invite.location_ids);

    const { error: memberError } = await service.from("business_members").upsert(
      {
        business_id: invite.business_id,
        auth_user_id: user.id,
        role: invite.role,
        access_scope: accessScope,
        access_permissions: accessPermissions,
        location_ids: locationIds,
      },
      { onConflict: "business_id,auth_user_id" },
    );

    if (memberError) {
      throw new Error(memberError.message);
    }

    const { error: inviteError } = await service
      .from("member_invites")
      .update({
        status: "accepted",
        accepted_by: user.id,
        accepted_at: new Date().toISOString(),
      })
      .eq("id", invite.id)
      .eq("status", "pending");

    if (inviteError) {
      throw new Error(inviteError.message);
    }

    acceptedCount += 1;
  }

  return acceptedCount;
}
