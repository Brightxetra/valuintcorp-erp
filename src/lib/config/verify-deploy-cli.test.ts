import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const deploymentEnvironmentNames = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_HCAPTCHA_SITE_KEY",
  "NEXT_PUBLIC_DEMO_MODE",
  "NEXT_PUBLIC_VALUINTCORP_E2E_MODE",
  "NEXT_PUBLIC_DEMO_LOGIN_ENABLED",
  "VALUINTCORP_E2E_DEMO_MODE",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ERP_ATTACHMENTS_BUCKET",
  "CRON_SECRET",
  "VERIFY_DEPLOY_LIVE",
  "VERCEL",
  "VERCEL_ENV",
  "VALUINTCORP_DEPLOYMENT_ENV",
  "CI",
] as const;

function isolatedEnvironment(overrides: NodeJS.ProcessEnv = {}) {
  const environment = { ...process.env };

  for (const name of deploymentEnvironmentNames) {
    delete environment[name];
  }

  environment.NODE_ENV = "test";
  return { ...environment, ...overrides };
}

function validEnvironment(overrides: NodeJS.ProcessEnv = {}) {
  return isolatedEnvironment({
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    NEXT_PUBLIC_HCAPTCHA_SITE_KEY: "captcha-site-key",
    NEXT_PUBLIC_DEMO_MODE: "false",
    NEXT_PUBLIC_DEMO_LOGIN_ENABLED: "true",
    SUPABASE_SERVICE_ROLE_KEY: "do-not-print-service-role-key",
    SUPABASE_ERP_ATTACHMENTS_BUCKET: "erp-attachments",
    CRON_SECRET: "do-not-print-cron-secret",
    ...overrides,
  });
}

function runVerifier(args: string[] = [], environment: NodeJS.ProcessEnv = isolatedEnvironment()) {
  return spawnSync(process.execPath, ["scripts/verify-deploy.mjs", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: environment,
  });
}

describe("deploy verifier CLI", () => {
  it("fails by default when production environment is missing", () => {
    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Missing env: NEXT_PUBLIC_SUPABASE_URL");
  });

  it("passes static production verification with complete configuration", () => {
    const result = runVerifier([], validEnvironment());

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Deploy verification passed.");
  });

  it("rejects demo fallback in the production profile", () => {
    const result = runVerifier([], validEnvironment({ NEXT_PUBLIC_DEMO_MODE: "true" }));

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("NEXT_PUBLIC_DEMO_MODE must be explicitly set to false");
  });

  it("rejects production-build E2E markers in the production profile", () => {
    const result = runVerifier([], validEnvironment({
      NEXT_PUBLIC_VALUINTCORP_E2E_MODE: "true",
      VALUINTCORP_E2E_DEMO_MODE: "true",
    }));

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("E2E runtime markers must not be enabled");
  });

  it("provides an explicit non-blocking local profile for missing credentials", () => {
    const result = runVerifier(["--profile=local"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Warnings:");
    expect(result.stdout).toContain("Local runtime will fail closed");
  });

  it("refuses the local profile inside CI", () => {
    const result = runVerifier(["--profile=local"], isolatedEnvironment({ CI: "1" }));

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("cannot run in CI or a production runtime");
  });

  it("rejects unknown CLI flags instead of silently skipping live verification", () => {
    const result = runVerifier(["--liv"], validEnvironment());

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Invalid deploy verification arguments: --liv");
  });

  it("requires live verification for explicit non-Vercel production", () => {
    const result = runVerifier([], validEnvironment({ VALUINTCORP_DEPLOYMENT_ENV: "production" }));

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Hosted production verification requires --live");
  });

  it("never prints configured secrets", () => {
    const environment = validEnvironment({ NEXT_PUBLIC_SUPABASE_URL: "not-a-url" });
    const result = runVerifier([], environment);

    expect(result.status).toBe(1);
    expect(`${result.stdout}${result.stderr}`).not.toContain(environment.SUPABASE_SERVICE_ROLE_KEY);
    expect(`${result.stdout}${result.stderr}`).not.toContain(environment.CRON_SECRET);
  });
});
