import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientMock,
}));

import {
  createServiceSupabaseClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service";

const projectRef = "abcdefghijklmnopqrst";
const canonicalOrigin = `https://${projectRef}.supabase.co`;

beforeEach(() => {
  createClientMock.mockReset();
  createClientMock.mockReturnValue({ kind: "service-client" });
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://data.example.com");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_public-example");
  vi.stubEnv("SUPABASE_PROJECT_REF", projectRef);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_service-example");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Supabase service client", () => {
  it("pins privileged traffic to the canonical project origin and rejects redirects", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    expect(isSupabaseServiceConfigured()).toBe(true);
    expect(createServiceSupabaseClient()).toEqual({ kind: "service-client" });
    expect(createClientMock).toHaveBeenCalledWith(
      canonicalOrigin,
      "sb_secret_service-example",
      expect.objectContaining({
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
        global: { fetch: expect.any(Function) },
      }),
    );

    const serviceFetch = createClientMock.mock.calls[0]?.[2]?.global.fetch;
    await serviceFetch?.(`${canonicalOrigin}/rest/v1/businesses`);

    expect(fetchMock).toHaveBeenCalledWith(
      `${canonicalOrigin}/rest/v1/businesses`,
      expect.objectContaining({ redirect: "error" }),
    );
  });

  it("rejects privileged requests to a non-canonical origin before fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    createServiceSupabaseClient();

    const serviceFetch = createClientMock.mock.calls[0]?.[2]?.global.fetch;
    await expect(
      serviceFetch?.("https://data.example.com/rest/v1/businesses"),
    ).rejects.toThrow("Supabase service request origin is invalid.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed when the pinned project ref is missing or malformed", () => {
    vi.stubEnv("SUPABASE_PROJECT_REF", "INVALID");

    expect(isSupabaseServiceConfigured()).toBe(false);
    expect(() => createServiceSupabaseClient()).toThrow("SUPABASE_PROJECT_REF");
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("fails closed when the privileged key is public-shaped", () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_publishable_wrong-kind");

    expect(isSupabaseServiceConfigured()).toBe(false);
    expect(() => createServiceSupabaseClient()).toThrow("SUPABASE_SERVICE_ROLE_KEY");
    expect(createClientMock).not.toHaveBeenCalled();
  });
});
