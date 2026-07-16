import { afterEach, describe, expect, it, vi } from "vitest";
import { isExplicitDemoMode, isSupabaseEnvConfigured, shouldUseDemoFallback } from "@/lib/auth/runtime";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("runtime demo detection", () => {
  it("fails closed when Supabase env is missing and demo is not explicit", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");

    expect(isSupabaseEnvConfigured()).toBe(false);
    expect(shouldUseDemoFallback()).toBe(false);
  });

  it("allows production mode when Supabase env is configured and explicit demo is false", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co\u200b");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon\n");
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");

    expect(isSupabaseEnvConfigured()).toBe(true);
    expect(isExplicitDemoMode()).toBe(false);
    expect(shouldUseDemoFallback()).toBe(false);
  });

  it("allows explicit demo fallback outside a production deployment", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL_ENV", "preview");

    expect(isExplicitDemoMode()).toBe(true);
    expect(shouldUseDemoFallback()).toBe(true);
  });

  it("rejects explicit demo fallback in a production deployment", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");

    expect(isExplicitDemoMode()).toBe(true);
    expect(shouldUseDemoFallback()).toBe(false);
  });

  it("always fails closed for self-hosted production", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("VALUINTCORP_DEPLOYMENT_ENV", "");

    expect(shouldUseDemoFallback()).toBe(false);
  });

  it("allows a production-built E2E runtime only with the private server marker", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("NEXT_PUBLIC_VALUINTCORP_E2E_MODE", "true");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("VALUINTCORP_DEPLOYMENT_ENV", "test");
    vi.stubEnv("VALUINTCORP_E2E_DEMO_MODE", "false");

    expect(shouldUseDemoFallback()).toBe(false);

    vi.stubEnv("VALUINTCORP_E2E_DEMO_MODE", "true");
    expect(shouldUseDemoFallback()).toBe(true);
  });

  it("never accepts the E2E marker on Vercel", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VALUINTCORP_DEPLOYMENT_ENV", "test");
    vi.stubEnv("VALUINTCORP_E2E_DEMO_MODE", "true");

    expect(shouldUseDemoFallback()).toBe(false);
  });

  it("rejects demo fallback in a production-built preview runtime", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "preview");

    expect(shouldUseDemoFallback()).toBe(false);
  });

  it("does not treat a partial Supabase config as demo authorization", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");

    expect(isSupabaseEnvConfigured()).toBe(false);
    expect(shouldUseDemoFallback()).toBe(false);
  });
});
