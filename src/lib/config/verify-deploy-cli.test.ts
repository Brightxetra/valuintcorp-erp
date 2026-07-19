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
  "SUPABASE_PROJECT_REF",
  "SUPABASE_ERP_ATTACHMENTS_BUCKET",
  "CRON_SECRET",
  "VERIFY_DEPLOY_LIVE",
  "VERCEL",
  "VERCEL_ENV",
  "VALUINTCORP_DEPLOYMENT_ENV",
  "CI",
] as const;

type EnvironmentOverrides = Record<string, string | undefined>;

function isolatedEnvironment(overrides: EnvironmentOverrides = {}) {
  const environment = { ...process.env };

  for (const name of deploymentEnvironmentNames) {
    delete environment[name];
  }

  environment.NODE_ENV = "test";
  return { ...environment, ...overrides };
}

function validEnvironment(overrides: EnvironmentOverrides = {}) {
  return isolatedEnvironment({
    NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_public-example",
    NEXT_PUBLIC_HCAPTCHA_SITE_KEY: "captcha-site-key",
    NEXT_PUBLIC_DEMO_MODE: "false",
    NEXT_PUBLIC_DEMO_LOGIN_ENABLED: "true",
    SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_do-not-print-service-role-key",
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

  it("requires the expected Supabase project ref", () => {
    const result = runVerifier([], validEnvironment({ SUPABASE_PROJECT_REF: "" }));

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Missing env: SUPABASE_PROJECT_REF");
  });

  it("rejects a hosted Supabase URL that does not match the expected project", () => {
    const result = runVerifier(
      [],
      validEnvironment({ NEXT_PUBLIC_SUPABASE_URL: "https://zyxwvutsrqponmlkjihg.supabase.co" }),
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("NEXT_PUBLIC_SUPABASE_URL does not match SUPABASE_PROJECT_REF");
  });

  it("rejects an unsafe frontend key statically without printing it", () => {
    const publicKey = "sb_secret_do-not-print-frontend-key";
    const result = runVerifier([], validEnvironment({ NEXT_PUBLIC_SUPABASE_ANON_KEY: publicKey }));

    expect(result.status).toBe(1);
    expect(result.stdout).toContain(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY must be a publishable key or legacy anon key",
    );
    expect(`${result.stdout}${result.stderr}`).not.toContain(publicKey);
  });

  it("rejects a frontend key that duplicates the privileged key", () => {
    const duplicatedKey = "sb_secret_duplicate-key";
    const result = runVerifier(
      [],
      validEnvironment({
        NEXT_PUBLIC_SUPABASE_ANON_KEY: duplicatedKey,
        SUPABASE_SERVICE_ROLE_KEY: duplicatedKey,
      }),
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toContain(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY must not match SUPABASE_SERVICE_ROLE_KEY",
    );
    expect(`${result.stdout}${result.stderr}`).not.toContain(duplicatedKey);
  });

  it("rejects a public-shaped privileged key", () => {
    const serviceRoleKey = "sb_publishable_do-not-print-service-key";
    const result = runVerifier([], validEnvironment({ SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey }));

    expect(result.status).toBe(1);
    expect(result.stdout).toContain(
      "SUPABASE_SERVICE_ROLE_KEY must be a secret key or legacy service_role key",
    );
    expect(`${result.stdout}${result.stderr}`).not.toContain(serviceRoleKey);
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

  it("normalizes padded control flags before validation", () => {
    const e2eResult = runVerifier(
      [],
      validEnvironment({
        NEXT_PUBLIC_DEMO_MODE: " false ",
        NEXT_PUBLIC_DEMO_LOGIN_ENABLED: " true ",
        NEXT_PUBLIC_VALUINTCORP_E2E_MODE: " true ",
      }),
    );

    expect(e2eResult.status).toBe(1);
    expect(e2eResult.stdout).toContain("E2E runtime markers must not be enabled");
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
    expect(result.stdout).toContain("Production verification requires --live");
  });

  it("requires live verification for plain NODE_ENV production", () => {
    const result = runVerifier([], validEnvironment({ NODE_ENV: "production" }));

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Production verification requires --live");
  });

  it("does not trust a preview marker without the Vercel system marker", () => {
    const result = runVerifier(
      [],
      validEnvironment({ NODE_ENV: "production", VERCEL_ENV: "preview" }),
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Production verification requires --live");
  });

  it("does not require a live check for a trusted Vercel preview", () => {
    const result = runVerifier(
      [],
      validEnvironment({ NODE_ENV: "production", VERCEL: " 1 ", VERCEL_ENV: " preview " }),
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Deploy verification passed.");
  });

  it("requires a live check when a trusted preview is explicitly labelled production", () => {
    const result = runVerifier(
      [],
      validEnvironment({
        NODE_ENV: "production",
        VERCEL: "1",
        VERCEL_ENV: "preview",
        VALUINTCORP_DEPLOYMENT_ENV: "production",
      }),
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Production verification requires --live");
  });

  it("never prints configured secrets", () => {
    const environment = validEnvironment({ NEXT_PUBLIC_SUPABASE_URL: "not-a-url" });
    const result = runVerifier([], environment);

    expect(result.status).toBe(1);
    expect(`${result.stdout}${result.stderr}`).not.toContain(environment.SUPABASE_SERVICE_ROLE_KEY);
    expect(`${result.stdout}${result.stderr}`).not.toContain(environment.CRON_SECRET);
  });
});
