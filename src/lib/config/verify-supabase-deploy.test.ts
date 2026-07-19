import { describe, expect, it, vi } from "vitest";
import {
  assertSupabasePublicKey,
  assertSupabaseServiceRoleKey,
  requiredLiveSupabaseTables,
  resolveSupabaseProjectIdentity,
  verifyLiveSupabaseSchema,
  verifySupabasePublicApi,
} from "../../../scripts/verify-supabase-deploy.mjs";

const projectRef = "abcdefghijklmnopqrst";
type FetchImpl = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type CreateClientImpl = typeof import("@supabase/supabase-js").createClient;

function legacyKey(role: string) {
  return `header.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.signature`;
}

describe("Supabase deployment health contract", () => {
  it("classifies publishable/anon and secret/service_role key formats", () => {
    expect(assertSupabasePublicKey("sb_publishable_public-example")).toBe(
      "sb_publishable_public-example",
    );
    expect(assertSupabasePublicKey(legacyKey("anon"))).toBe(legacyKey("anon"));
    expect(assertSupabaseServiceRoleKey("sb_secret_service-example")).toBe(
      "sb_secret_service-example",
    );
    expect(assertSupabaseServiceRoleKey(legacyKey("service_role"))).toBe(
      legacyKey("service_role"),
    );

    expect(() => assertSupabasePublicKey("sb_secret_wrong-kind")).toThrow(
      "publishable key or legacy anon key",
    );
    expect(() => assertSupabaseServiceRoleKey("sb_publishable_wrong-kind")).toThrow(
      "secret key or legacy service_role key",
    );
  });

  it("deduplicates the configured and canonical origin for the expected hosted project", () => {
    expect(
      resolveSupabaseProjectIdentity(`https://${projectRef}.supabase.co/`, projectRef),
    ).toEqual({
      canonicalOrigin: `https://${projectRef}.supabase.co`,
      configuredOrigin: `https://${projectRef}.supabase.co`,
      probeOrigins: [`https://${projectRef}.supabase.co`],
    });
  });

  it("supports a custom domain while retaining the canonical identity probe", () => {
    expect(resolveSupabaseProjectIdentity("https://data.example.com", projectRef).probeOrigins).toEqual([
      "https://data.example.com",
      `https://${projectRef}.supabase.co`,
    ]);
  });

  it("rejects a hosted URL that belongs to another project", () => {
    expect(() =>
      resolveSupabaseProjectIdentity("https://zyxwvutsrqponmlkjihg.supabase.co", projectRef),
    ).toThrow("NEXT_PUBLIC_SUPABASE_URL does not match SUPABASE_PROJECT_REF.");
  });

  it("probes Auth settings with only the frontend API key", async () => {
    const publicKey = "sb_publishable_public-example";
    const fetchImpl = vi.fn<FetchImpl>(async () =>
      new Response(JSON.stringify({ external: { email: true } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await verifySupabasePublicApi({
      fetchImpl,
      projectRef,
      publicKey,
      supabaseUrl: "https://data.example.com",
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    for (const [url, init] of fetchImpl.mock.calls) {
      expect(url).toMatch(/\/auth\/v1\/settings$/);
      expect(init?.headers).toEqual({ Accept: "application/json", apikey: publicKey });
      expect(init?.headers).not.toHaveProperty("Authorization");
      expect(init?.redirect).toBe("error");
    }
  });

  it("rejects an invalid public key without exposing it in the error", async () => {
    const publicKey = "sb_publishable_do-not-print-invalid-public-key";
    const fetchImpl = vi.fn(async () => new Response(null, { status: 401 }));

    let message = "";
    try {
      await verifySupabasePublicApi({
        fetchImpl,
        projectRef,
        publicKey,
        supabaseUrl: `https://${projectRef}.supabase.co`,
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain("HTTP 401");
    expect(message).not.toContain(publicKey);
  });

  it("rejects a malformed Auth settings payload", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      verifySupabasePublicApi({
        fetchImpl,
        projectRef,
        publicKey: "sb_publishable_public-example",
        supabaseUrl: `https://${projectRef}.supabase.co`,
      }),
    ).rejects.toThrow("invalid Auth settings payload");
  });

  it("fails closed before creating a service client when the public probe fails", async () => {
    const serviceRoleKey = "sb_secret_do-not-send-service-role-key";
    const fetchImpl = vi.fn(async () => new Response(null, { status: 401 }));
    const createClientImpl = vi.fn();

    await expect(
      verifyLiveSupabaseSchema({
        createClientImpl,
        fetchImpl,
        projectRef,
        publicKey: "sb_publishable_invalid-public-key",
        serviceRoleKey,
        supabaseUrl: "https://data.example.com",
      }),
    ).rejects.toThrow("HTTP 401");

    expect(createClientImpl).not.toHaveBeenCalled();
    expect(JSON.stringify(fetchImpl.mock.calls)).not.toContain(serviceRoleKey);
  });

  it("rejects unsafe or duplicated frontend keys before any network or client work", async () => {
    const serviceRoleKey = "sb_secret_service-example";

    for (const publicKey of ["sb_secret_frontend-example", serviceRoleKey]) {
      const fetchImpl = vi.fn();
      const createClientImpl = vi.fn();

      await expect(
        verifyLiveSupabaseSchema({
          createClientImpl,
          fetchImpl,
          projectRef,
          publicKey,
          serviceRoleKey,
          supabaseUrl: `https://${projectRef}.supabase.co`,
        }),
      ).rejects.toThrow();

      expect(fetchImpl).not.toHaveBeenCalled();
      expect(createClientImpl).not.toHaveBeenCalled();
    }
  });

  it("uses the canonical project origin for service-role checks behind a custom domain", async () => {
    const publicKey = "sb_publishable_public-example";
    const serviceRoleKey = "sb_secret_do-not-send-to-custom-domain";
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ external: { email: true } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const from = vi.fn(() => ({
      select: vi.fn(() => ({
        limit: vi.fn(async () => ({ error: null })),
      })),
    }));
    const createClientImpl = vi.fn(
      (
        _url: string,
        _key: string,
        _options: {
          auth: { persistSession: boolean };
          global: { fetch: FetchImpl };
        },
      ) => {
        void _url;
        void _key;
        void _options;
        return { from };
      },
    );

    await verifyLiveSupabaseSchema({
      createClientImpl: createClientImpl as unknown as CreateClientImpl,
      fetchImpl,
      projectRef,
      publicKey,
      serviceRoleKey,
      supabaseUrl: "https://data.example.com",
    });

    expect(createClientImpl).toHaveBeenCalledWith(
      `https://${projectRef}.supabase.co`,
      serviceRoleKey,
      expect.objectContaining({
        auth: { persistSession: false },
        global: { fetch: expect.any(Function) },
      }),
    );

    const serviceFetch = createClientImpl.mock.calls[0]?.[2]?.global.fetch;
    await serviceFetch?.(`https://${projectRef}.supabase.co/rest/v1/businesses`);

    expect(fetchImpl).toHaveBeenLastCalledWith(
      `https://${projectRef}.supabase.co/rest/v1/businesses`,
      expect.objectContaining({ redirect: "error", signal: expect.any(AbortSignal) }),
    );

    const fetchCallCount = fetchImpl.mock.calls.length;
    await expect(
      serviceFetch?.("https://data.example.com/rest/v1/businesses"),
    ).rejects.toThrow("Supabase service request origin is invalid.");
    expect(fetchImpl).toHaveBeenCalledTimes(fetchCallCount);
    expect(from).toHaveBeenCalledTimes(requiredLiveSupabaseTables.length);
    expect(JSON.stringify(fetchImpl.mock.calls)).not.toContain(serviceRoleKey);
  });

  it("covers the core sales, purchasing, inventory, and accounting tables", () => {
    expect(requiredLiveSupabaseTables).toEqual(
      expect.arrayContaining([
        "customers",
        "suppliers",
        "products",
        "warehouses",
        "stock_movements",
        "sales_invoices",
        "sales_invoice_lines",
        "purchase_bills",
        "purchase_bill_lines",
        "payments",
        "chart_of_accounts",
        "journal_entries",
        "journal_lines",
        "report_periods",
        "tax_profiles",
      ]),
    );
  });
});
