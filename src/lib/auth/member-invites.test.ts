import { describe, expect, it } from "vitest";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { findAuthUserByEmail, normalizeInviteEmail, summarizeAuthUser } from "@/lib/auth/member-invites";

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
});
