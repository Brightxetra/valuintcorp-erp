import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { hasConfigMock, signOutMock } = vi.hoisted(() => ({
  hasConfigMock: vi.fn(),
  signOutMock: vi.fn(),
}));

vi.mock("@/lib/supabase/config", () => ({
  hasSupabasePublicConfig: hasConfigMock,
}));

vi.mock("@/lib/supabase/client", () => ({
  createBrowserSupabaseClient: () => ({
    auth: {
      signOut: signOutMock,
    },
  }),
}));

import {
  buildBrowserCookie,
  isSupabaseBrowserEnabled,
  shouldUseDemoFallbackBrowser,
  signOutLocalBrowserSession,
} from "@/lib/erp/client-api";

describe("ERP client API auth helpers", () => {
  beforeEach(() => {
    hasConfigMock.mockReset();
    hasConfigMock.mockReturnValue(true);
    signOutMock.mockReset();
    signOutMock.mockResolvedValue({ error: null });
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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

  it("does not enable browser demo fallback when Supabase config is missing", () => {
    hasConfigMock.mockReturnValue(false);

    expect(isSupabaseBrowserEnabled()).toBe(false);
    expect(shouldUseDemoFallbackBrowser()).toBe(false);
  });

  it("enables browser demo fallback only through the explicit flag", () => {
    hasConfigMock.mockReturnValue(false);
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("NODE_ENV", "test");

    expect(shouldUseDemoFallbackBrowser()).toBe(true);
  });

  it("fails closed in a production browser build even when demo is explicit", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("NODE_ENV", "production");

    expect(shouldUseDemoFallbackBrowser()).toBe(false);
  });

  it("recognizes the browser half of the production-built E2E harness", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("NEXT_PUBLIC_VALUINTCORP_E2E_MODE", "true");
    vi.stubEnv("NODE_ENV", "production");

    expect(shouldUseDemoFallbackBrowser()).toBe(true);
  });
});
