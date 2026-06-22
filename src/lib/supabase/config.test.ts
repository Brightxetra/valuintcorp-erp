import { afterEach, describe, expect, it } from "vitest";
import {
  getSupabasePublicConfig,
  hasSupabasePublicConfig,
  sanitizeSupabaseEnvValue,
} from "@/lib/supabase/config";

const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

afterEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnon;
});

describe("Supabase config", () => {
  it("removes characters that cannot be used in browser fetch headers", () => {
    const sanitized = sanitizeSupabaseEnvValue(" \u200bsb_publishable__ABC\n🚫DEF\t ");

    expect(sanitized).toBe("sb_publishable__ABCDEF");
    expect(() => new Headers({ apikey: sanitized ?? "" })).not.toThrow();
  });

  it("normalizes public Supabase env before reporting it configured", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "\u200b\"https://example.supabase.co\"\u200b";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "\u200b\"sb_publishable__A\r\nB\"\u200b";

    expect(hasSupabasePublicConfig()).toBe(true);
    expect(getSupabasePublicConfig()).toEqual({
      url: "https://example.supabase.co",
      anonKey: "sb_publishable__AB",
    });
  });
});
