import { describe, expect, it } from "vitest";
import {
  assertProductionEnvironment,
  collectProductionEnvironmentIssues,
  isProductionBuildE2ETestRuntime,
  isProductionDeployment,
  shouldEnforceProductionEnvironment,
  type DeploymentEnvironment,
} from "@/lib/config/deployment-environment";

function validProductionEnvironment(
  overrides: DeploymentEnvironment = {},
): DeploymentEnvironment {
  return {
    VERCEL_ENV: "production",
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    NEXT_PUBLIC_HCAPTCHA_SITE_KEY: "captcha-site-key",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    SUPABASE_ERP_ATTACHMENTS_BUCKET: "erp-attachments",
    CRON_SECRET: "cron-secret",
    NEXT_PUBLIC_DEMO_MODE: "false",
    ...overrides,
  };
}

describe("production deployment environment", () => {
  it("recognizes Vercel and explicit production deployments", () => {
    expect(isProductionDeployment({ VERCEL_ENV: "production" })).toBe(true);
    expect(isProductionDeployment({ VALUINTCORP_DEPLOYMENT_ENV: "production" })).toBe(true);
    expect(isProductionDeployment({ VERCEL_ENV: "preview" })).toBe(false);
    expect(isProductionDeployment({ NODE_ENV: "production" })).toBe(true);
    expect(isProductionDeployment({ NODE_ENV: "production", VALUINTCORP_DEPLOYMENT_ENV: "test" })).toBe(true);
    expect(shouldEnforceProductionEnvironment({ NODE_ENV: "production" })).toBe(false);
    expect(shouldEnforceProductionEnvironment({ VERCEL_ENV: "production" })).toBe(true);
  });

  it("does not enforce production credentials for local or preview builds", () => {
    expect(() => assertProductionEnvironment({ VERCEL_ENV: "preview" })).not.toThrow();
    expect(() => assertProductionEnvironment({})).not.toThrow();
  });

  it("recognizes only the private, non-Vercel production-build E2E tuple", () => {
    const environment = {
      NODE_ENV: "production",
      VERCEL_ENV: "",
      VALUINTCORP_DEPLOYMENT_ENV: "test",
      VALUINTCORP_E2E_DEMO_MODE: "true",
    };

    expect(isProductionBuildE2ETestRuntime(environment)).toBe(true);
    expect(isProductionBuildE2ETestRuntime({ ...environment, VALUINTCORP_E2E_DEMO_MODE: "false" })).toBe(false);
    expect(isProductionBuildE2ETestRuntime({ ...environment, VERCEL_ENV: "preview" })).toBe(false);
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
        SUPABASE_ERP_ATTACHMENTS_BUCKET: "invalid bucket name",
      }),
    );

    expect(issues).toContain("NEXT_PUBLIC_DEMO_MODE must be explicitly set to false.");
    expect(issues).toContain("NEXT_PUBLIC_VALUINTCORP_E2E_MODE must not be enabled in production.");
    expect(issues).toContain("VALUINTCORP_E2E_DEMO_MODE must not be enabled in production.");
    expect(issues).toContain("NEXT_PUBLIC_SUPABASE_URL must use HTTPS.");
    expect(issues).toContain("SUPABASE_ERP_ATTACHMENTS_BUCKET has an invalid name.");
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
