import { describe, expect, it } from "vitest";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  acceptPendingMemberInvitesForUser,
  findAuthUserByEmail,
  normalizeInviteEmail,
  summarizeAuthUser,
} from "@/lib/auth/member-invites";

describe("member invite auth helpers", () => {
  it("normalizes invite email addresses before lookup/storage", () => {
    expect(normalizeInviteEmail(" Finance@Usaha.CO.ID ")).toBe("finance@usaha.co.id");
  });

  it("summarizes auth users without exposing unrelated auth metadata", () => {
    const summary = summarizeAuthUser({
      id: "user-1",
      aud: "authenticated",
      app_metadata: {},
      user_metadata: { name: "Finance User" },
      email: "finance@usaha.co.id",
      created_at: "2026-06-23T00:00:00.000Z",
      email_confirmed_at: "2026-06-23T00:01:00.000Z",
    } as User);

    expect(summary).toEqual({
      id: "user-1",
      email: "finance@usaha.co.id",
      name: "Finance User",
      emailConfirmedAt: "2026-06-23T00:01:00.000Z",
      invitedAt: undefined,
      lastSignInAt: undefined,
    });
  });

  it("finds an existing Supabase auth user by email across paginated admin results", async () => {
    const fakeService = {
      auth: {
        admin: {
          listUsers: async ({ page }: { page?: number }) => {
            if (page === 1) {
              return {
                data: { users: [], aud: "authenticated", nextPage: 2, lastPage: 2, total: 1 },
                error: null,
              };
            }

            return {
              data: {
                users: [{
                  id: "existing-user",
                  aud: "authenticated",
                  app_metadata: {},
                  user_metadata: {},
                  email: "Staff@Usaha.co.id",
                  created_at: "2026-06-23T00:00:00.000Z",
                }],
                aud: "authenticated",
                nextPage: null,
                lastPage: 2,
                total: 1,
              },
              error: null,
            };
          },
        },
      },
    } as unknown as SupabaseClient;

    await expect(findAuthUserByEmail(fakeService, " staff@usaha.CO.ID ")).resolves.toMatchObject({
      id: "existing-user",
      email: "Staff@Usaha.co.id",
    });
  });

  it("accepts pending invites only through the bounded service-role RPC", async () => {
    const calls: Array<{ functionName: string; args: unknown }> = [];
    const fakeService = {
      rpc: async (functionName: string, args: unknown) => {
        calls.push({ functionName, args });
        return { data: 1, error: null };
      },
    } as unknown as SupabaseClient;

    await expect(acceptPendingMemberInvitesForUser(fakeService, {
      id: "target-user",
      email: " New.Member@Usaha.CO.ID ",
    })).resolves.toBe(1);

    expect(calls).toEqual([{
      functionName: "accept_pending_member_invites_for_user",
      args: {
        payload: {
          targetUserId: "target-user",
          targetEmail: "new.member@usaha.co.id",
        },
      },
    }]);
  });

  it("does not fall back to direct membership writes when invite acceptance is rejected", async () => {
    const fakeService = {
      rpc: async () => ({
        data: null,
        error: { message: "The member invite authority is no longer valid." },
      }),
    } as unknown as SupabaseClient;

    await expect(acceptPendingMemberInvitesForUser(fakeService, {
      id: "target-user",
      email: "target@example.com",
    })).rejects.toThrow("The member invite authority is no longer valid.");
  });
});
