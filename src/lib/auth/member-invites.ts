import type { SupabaseClient, User } from "@supabase/supabase-js";

export interface AuthUserSummary {
  id: string;
  email?: string;
  name?: string;
  emailConfirmedAt?: string;
  invitedAt?: string;
  lastSignInAt?: string;
}

export function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase();
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

  const { data, error } = await service.rpc("accept_pending_member_invites_for_user", {
    payload: {
      targetUserId: user.id,
      targetEmail: normalizedEmail,
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  const acceptedCount = typeof data === "number" ? data : Number(data ?? 0);
  return Number.isSafeInteger(acceptedCount) && acceptedCount >= 0 ? acceptedCount : 0;
}
