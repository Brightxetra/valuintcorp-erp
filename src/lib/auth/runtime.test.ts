import { afterEach, describe, expect, it } from "vitest";
import { isExplicitDemoMode, isSupabaseEnvConfigured, shouldUseDemoFallback } from "@/lib/auth/runtime";

const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const originalDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE;

afterEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnon;
  process.env.NEXT_PUBLIC_DEMO_MODE = originalDemoMode;
});

describe("runtime demo detection", () => {
  it("uses demo fallback when Supabase env is missing", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.NEXT_PUBLIC_DEMO_MODE = "false";

    expect(isSupabaseEnvConfigured()).toBe(false);
    expect(shouldUseDemoFallback()).toBe(true);
  });

  it("allows production mode when Supabase env is configured and explicit demo is false", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co\u200b";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon\n";
    process.env.NEXT_PUBLIC_DEMO_MODE = "false";

    expect(isSupabaseEnvConfigured()).toBe(true);
    expect(isExplicitDemoMode()).toBe(false);
    expect(shouldUseDemoFallback()).toBe(false);
  });

  it("forces demo fallback when explicit demo mode is true", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    process.env.NEXT_PUBLIC_DEMO_MODE = "true";

    expect(isExplicitDemoMode()).toBe(true);
    expect(shouldUseDemoFallback()).toBe(true);
  });
});
