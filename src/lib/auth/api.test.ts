import { afterEach, describe, expect, it } from "vitest";
import { isApiResponse, requireApiPermission } from "@/lib/auth/api";

const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

afterEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnon;
});

describe("api permission guard", () => {
  it("allows demo owner requests when Supabase is not configured", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const context = await requireApiPermission(new Request("http://localhost/api"), "reports:export");

    expect(isApiResponse(context)).toBe(false);
    if (!isApiResponse(context)) {
      expect(context.demoMode).toBe(true);
      expect(context.role).toBe("owner");
    }
  });

  it("denies demo staff report exports", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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
});
