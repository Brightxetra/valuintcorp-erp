import { describe, expect, it } from "vitest";
import {
  assertProductionEnvironment,
  collectProductionEnvironmentIssues,
  collectVercelDeploymentMarkerIssues,
  isProductionBuildE2ETestRuntime,
  isProductionDeployment,
  shouldEnforceProductionEnvironment,
  type DeploymentEnvironment,
} from "@/lib/config/deployment-environment";

function validProductionEnvironment(
  overrides: DeploymentEnvironment = {},
): DeploymentEnvironment {
  return {
    VERCEL: "1",
    VERCEL_ENV: "production",
    NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_public-example",
    NEXT_PUBLIC_HCAPTCHA_SITE_KEY: "captcha-site-key",
    SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_service-example",
    SUPABASE_ERP_ATTACHMENTS_BUCKET: "erp-attachments",
    CRON_SECRET: "cron-secret",
    NEXT_PUBLIC_DEMO_MODE: "false",
    ...overrides,
  };
}

describe("production deployment environment", () => {
  it("recognizes Vercel and explicit production deployments", () => {
    expect(isProductionDeployment({ VERCEL_ENV: "production" })).toBe(true);
    expect(isProductionDeployment({ VERCEL: "1", VERCEL_ENV: "production" })).toBe(true);
    expect(isProductionDeployment({ VALUINTCORP_DEPLOYMENT_ENV: "production" })).toBe(true);
    expect(isProductionDeployment({ VERCEL_ENV: "preview" })).toBe(false);
    expect(isProductionDeployment({ NODE_ENV: "production" })).toBe(true);
    expect(isProductionDeployment({ NODE_ENV: "production", VALUINTCORP_DEPLOYMENT_ENV: "test" })).toBe(true);
    expect(shouldEnforceProductionEnvironment({ NODE_ENV: "production" })).toBe(true);
    expect(shouldEnforceProductionEnvironment({ VERCEL_ENV: "production" })).toBe(true);
    expect(shouldEnforceProductionEnvironment({ VERCEL_ENV: "preview", NODE_ENV: "production" })).toBe(true);
    expect(
      shouldEnforceProductionEnvironment({ VERCEL: "1", VERCEL_ENV: "preview", NODE_ENV: "production" }),
    ).toBe(false);
    expect(
      shouldEnforceProductionEnvironment({ VERCEL: " 1 ", VERCEL_ENV: " preview ", NODE_ENV: " production " }),
    ).toBe(false);
    expect(
      shouldEnforceProductionEnvironment({
        VERCEL: "1",
        VERCEL_ENV: "preview",
        NODE_ENV: "production",
        VALUINTCORP_DEPLOYMENT_ENV: "production",
      }),
    ).toBe(true);
  });

  it("does not enforce production credentials for local or preview builds", () => {
    expect(() =>
      assertProductionEnvironment({ VERCEL: "1", VERCEL_ENV: "preview", NODE_ENV: "production" }),
    ).not.toThrow();
    expect(() =>
      assertProductionEnvironment({
        VERCEL: "1",
        VERCEL_ENV: "development",
        NODE_ENV: "production",
        NEXT_PUBLIC_DEMO_MODE: "true",
      }),
    ).not.toThrow();
    expect(() => assertProductionEnvironment({})).not.toThrow();
  });

  it("rejects demo, E2E, and secret-shaped frontend keys on Vercel previews", () => {
    const preview = {
      VERCEL: "1",
      VERCEL_ENV: "preview",
      NODE_ENV: "production",
      NEXT_PUBLIC_DEMO_MODE: "true",
      NEXT_PUBLIC_VALUINTCORP_E2E_MODE: "true",
      VALUINTCORP_E2E_DEMO_MODE: "true",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_secret_private-example",
      SUPABASE_SERVICE_ROLE_KEY: "sb_publishable_wrong-kind",
    };

    expect(collectVercelDeploymentMarkerIssues(preview)).toEqual(
      expect.arrayContaining([
        "NEXT_PUBLIC_DEMO_MODE must not be enabled on Vercel deployments.",
        "NEXT_PUBLIC_VALUINTCORP_E2E_MODE must not be enabled on Vercel deployments.",
        "VALUINTCORP_E2E_DEMO_MODE must not be enabled on Vercel deployments.",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY must be a publishable key or legacy anon key.",
        "SUPABASE_SERVICE_ROLE_KEY must be a secret key or legacy service_role key.",
      ]),
    );
    expect(() => assertProductionEnvironment(preview)).toThrow("Vercel deployments");
  });

  it("recognizes only the complete non-Vercel production-build E2E tuple", () => {
    const environment = {
      NODE_ENV: "production",
      VERCEL_ENV: "",
      VALUINTCORP_DEPLOYMENT_ENV: "test",
      NEXT_PUBLIC_DEMO_MODE: "true",
      NEXT_PUBLIC_VALUINTCORP_E2E_MODE: "true",
      VALUINTCORP_E2E_DEMO_MODE: "true",
    };

    expect(isProductionBuildE2ETestRuntime(environment)).toBe(true);
    expect(shouldEnforceProductionEnvironment(environment)).toBe(false);
    expect(isProductionBuildE2ETestRuntime({ ...environment, NEXT_PUBLIC_DEMO_MODE: "false" })).toBe(false);
    expect(isProductionBuildE2ETestRuntime({ ...environment, NEXT_PUBLIC_VALUINTCORP_E2E_MODE: "" })).toBe(false);
    expect(isProductionBuildE2ETestRuntime({ ...environment, VALUINTCORP_E2E_DEMO_MODE: "false" })).toBe(false);
    expect(isProductionBuildE2ETestRuntime({ ...environment, VERCEL_ENV: "preview" })).toBe(false);
    expect(isProductionBuildE2ETestRuntime({ ...environment, VERCEL: "1" })).toBe(false);
    expect(shouldEnforceProductionEnvironment({ ...environment, NEXT_PUBLIC_VALUINTCORP_E2E_MODE: "" })).toBe(true);
  });

  it("fails closed for plain and partially marked self-hosted production", () => {
    expect(() => assertProductionEnvironment({ NODE_ENV: "production" })).toThrow(
      /Missing environment variable: NEXT_PUBLIC_SUPABASE_URL/,
    );
    expect(() =>
      assertProductionEnvironment({
        NODE_ENV: "production",
        VALUINTCORP_DEPLOYMENT_ENV: "test",
        NEXT_PUBLIC_DEMO_MODE: "true",
        VALUINTCORP_E2E_DEMO_MODE: "true",
      }),
    ).toThrow(/Missing environment variable: NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("fails closed when a production credential is missing", () => {
    const environment = validProductionEnvironment({ CRON_SECRET: "" });

    expect(() => assertProductionEnvironment(environment, "Next.js production build")).toThrow(
      /Missing environment variable: CRON_SECRET/,
    );
  });

  it("rejects demo mode and malformed public configuration in production", () => {
    const issues = collectProductionEnvironmentIssues(
      validProductionEnvironment({
        NEXT_PUBLIC_DEMO_MODE: "true",
        NEXT_PUBLIC_VALUINTCORP_E2E_MODE: "true",
        VALUINTCORP_E2E_DEMO_MODE: "true",
        NEXT_PUBLIC_SUPABASE_URL: "http://not-secure.example",
        SUPABASE_PROJECT_REF: "INVALID",
        SUPABASE_ERP_ATTACHMENTS_BUCKET: "invalid bucket name",
      }),
    );

    expect(issues).toContain("NEXT_PUBLIC_DEMO_MODE must be explicitly set to false.");
    expect(issues).toContain("NEXT_PUBLIC_VALUINTCORP_E2E_MODE must not be enabled in production.");
    expect(issues).toContain("VALUINTCORP_E2E_DEMO_MODE must not be enabled in production.");
    expect(issues).toContain("NEXT_PUBLIC_SUPABASE_URL must use HTTPS.");
    expect(issues).toContain("SUPABASE_PROJECT_REF must be a 20-character lowercase project ref.");
    expect(issues).toContain("SUPABASE_ERP_ATTACHMENTS_BUCKET has an invalid name.");
  });

  it("rejects a secret-shaped or duplicated frontend key", () => {
    expect(
      collectProductionEnvironmentIssues(
        validProductionEnvironment({ NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_secret_private-example" }),
      ),
    ).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY must be a publishable key or legacy anon key.");

    expect(
      collectProductionEnvironmentIssues(
        validProductionEnvironment({
          NEXT_PUBLIC_SUPABASE_ANON_KEY: "same-key",
          SUPABASE_SERVICE_ROLE_KEY: "same-key",
        }),
      ),
    ).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY must not match SUPABASE_SERVICE_ROLE_KEY.");

    expect(
      collectProductionEnvironmentIssues(
        validProductionEnvironment({ SUPABASE_SERVICE_ROLE_KEY: "not-a-service-key" }),
      ),
    ).toContain("SUPABASE_SERVICE_ROLE_KEY must be a secret key or legacy service_role key.");
  });

  it("rejects Supabase URLs with extra components or a mismatched hosted project", () => {
    expect(
      collectProductionEnvironmentIssues(
        validProductionEnvironment({ NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co/rest/v1" }),
      ),
    ).toContain(
      "NEXT_PUBLIC_SUPABASE_URL must be an HTTPS origin without credentials, path, query, or hash.",
    );
    expect(
      collectProductionEnvironmentIssues(
        validProductionEnvironment({ NEXT_PUBLIC_SUPABASE_URL: "https://zyxwvutsrqponmlkjihg.supabase.co" }),
      ),
    ).toContain("NEXT_PUBLIC_SUPABASE_URL does not match SUPABASE_PROJECT_REF.");
  });

  it("accepts a complete production configuration", () => {
    expect(collectProductionEnvironmentIssues(validProductionEnvironment())).toEqual([]);
    expect(() => assertProductionEnvironment(validProductionEnvironment())).not.toThrow();
  });

  it("never includes secret values in validation errors", () => {
    const secret = "do-not-print-this-secret";
    const environment = validProductionEnvironment({
      CRON_SECRET: secret,
      NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
    });

    let message = "";
    try {
      assertProductionEnvironment(environment);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).not.toContain(secret);
  });
});
