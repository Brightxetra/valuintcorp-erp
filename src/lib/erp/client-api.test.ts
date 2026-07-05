import { beforeEach, describe, expect, it, vi } from "vitest";

const { signOutMock } = vi.hoisted(() => ({
  signOutMock: vi.fn(),
}));

vi.mock("@/lib/supabase/config", () => ({
  hasSupabasePublicConfig: () => true,
}));

vi.mock("@/lib/supabase/client", () => ({
  createBrowserSupabaseClient: () => ({
    auth: {
      signOut: signOutMock,
    },
  }),
}));

import { buildBrowserCookie, signOutLocalBrowserSession } from "@/lib/erp/client-api";

describe("ERP client API auth helpers", () => {
  beforeEach(() => {
    signOutMock.mockReset();
    signOutMock.mockResolvedValue({ error: null });
  });

  it("builds secure browser cookies for session cleanup", () => {
    expect(buildBrowserCookie("session", "token.value", 3600, true)).toBe(
      "session=token.value; Path=/; SameSite=Lax; Max-Age=3600; Secure",
    );
  });

  it("expires browser cookies with a non-negative max age", () => {
    expect(buildBrowserCookie("session", "", -1, false)).toBe(
      "session=; Path=/; SameSite=Lax; Max-Age=0",
    );
  });

  it("signs out only the current Supabase browser session", async () => {
    await signOutLocalBrowserSession();

    expect(signOutMock).toHaveBeenCalledWith({ scope: "local" });
  });
});
