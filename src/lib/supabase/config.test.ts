import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getErpAttachmentsBucket,
  getSupabasePublicConfig,
  hasSupabasePublicConfig,
  isSupabasePublicKey,
  isSupabaseServiceRoleKey,
  sanitizeSupabaseEnvValue,
} from "@/lib/supabase/config";

const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

afterEach(() => {
  vi.unstubAllEnvs();
  process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnon;
});
function legacyKey(role: string) {
  return `header.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.signature`;
}


describe("Supabase config", () => {
  it.each([
    ["\uFEFFerp-attachments", "erp-attachments"],
    ["\r\ncustom-attachments  ", "custom-attachments"],
    [undefined, "erp-attachments"],
  ])("normalizes the attachments bucket before storage requests", (value, expectedBucket) => {
    vi.stubEnv("SUPABASE_ERP_ATTACHMENTS_BUCKET", value);
    expect(getErpAttachmentsBucket()).toBe(expectedBucket);
  });

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

  it("accepts only publishable or legacy anon keys as browser configuration", () => {
    expect(isSupabasePublicKey("sb_publishable_public-example")).toBe(true);
    expect(isSupabasePublicKey(legacyKey("anon"))).toBe(true);
    expect(isSupabasePublicKey("sb_secret_private-example")).toBe(false);
    expect(isSupabasePublicKey(legacyKey("service_role"))).toBe(false);
    expect(isSupabasePublicKey("unknown-key-format")).toBe(false);

    expect(isSupabaseServiceRoleKey("sb_secret_private-example")).toBe(true);
    expect(isSupabaseServiceRoleKey(legacyKey("service_role"))).toBe(true);
    expect(isSupabaseServiceRoleKey("sb_publishable_public-example")).toBe(false);
    expect(isSupabaseServiceRoleKey(legacyKey("anon"))).toBe(false);
  });

  it("fails closed instead of exposing a secret-shaped frontend key", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "sb_secret_private-example";

    expect(hasSupabasePublicConfig()).toBe(false);
    expect(getSupabasePublicConfig()).toBeNull();
  });
});
