import { afterEach, describe, expect, it, vi } from "vitest";
import { isApiResponse, requireApiMembership, requireApiPermission } from "@/lib/auth/api";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("api permission guard", () => {
  it("allows demo owner requests only when demo mode is explicit", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("VERCEL_ENV", "preview");

    const context = await requireApiPermission(new Request("http://localhost/api"), "reports:export");

    expect(isApiResponse(context)).toBe(false);
    if (!isApiResponse(context)) {
      expect(context.demoMode).toBe(true);
      expect(context.role).toBe("owner");
    }
  });

  it("denies demo staff report exports", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("VERCEL_ENV", "preview");

    const response = await requireApiPermission(
      new Request("http://localhost/api", { headers: { "x-demo-role": "staff" } }),
      "reports:export",
    );

    expect(isApiResponse(response)).toBe(true);
    if (isApiResponse(response)) {
      expect(response.status).toBe(403);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("allows a demo tenant member through the membership-only shell guard", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("VERCEL_ENV", "preview");

    const context = await requireApiMembership(
      new Request("http://localhost/api", { headers: { "x-demo-role": "staff" } }),
    );

    expect(isApiResponse(context)).toBe(false);
    if (!isApiResponse(context)) {
      expect(context.role).toBe("staff");
      expect(context.permissions).toContain("business:read");
    }
  });

  it("returns service unavailable instead of a synthetic owner when config is missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");

    const response = await requireApiPermission(
      new Request("http://localhost/api", { headers: { "x-demo-role": "owner" } }),
      "reports:export",
    );

    expect(isApiResponse(response)).toBe(true);
    if (isApiResponse(response)) {
      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("fails the membership-only shell guard closed when configuration is missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");

    const response = await requireApiMembership(new Request("http://localhost/api"));

    expect(isApiResponse(response)).toBe(true);
    if (isApiResponse(response)) {
      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
  });
});
