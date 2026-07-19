import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories: string[] = [];
type EnvironmentOverrides = Record<string, string | undefined>;

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function runSeed(overrides: EnvironmentOverrides = {}) {
  const cwd = mkdtempSync(join(tmpdir(), "valuintcorp-seed-test-"));
  temporaryDirectories.push(cwd);
  const environment = { ...process.env };

  for (const name of [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_PROJECT_REF",
    "SUPABASE_SERVICE_ROLE_KEY",
    "DEMO_ACCOUNT_PASSWORD",
  ]) {
    delete environment[name];
  }

  return spawnSync(process.execPath, [join(process.cwd(), "scripts/seed-demo-accounts.mjs")], {
    cwd,
    encoding: "utf8",
    env: { ...environment, ...overrides },
  });
}

describe("demo account seed CLI", () => {
  it("requires an explicit seed password before any remote work", () => {
    const result = runSeed({
      NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
      SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
      SUPABASE_SERVICE_ROLE_KEY: "sb_secret_service-example",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Missing DEMO_ACCOUNT_PASSWORD");
  });

  it("rejects an invalid privileged key without printing the seed password", () => {
    const password = "do-not-print-demo-password";
    const result = runSeed({
      NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
      SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
      SUPABASE_SERVICE_ROLE_KEY: "sb_publishable_wrong-kind",
      DEMO_ACCOUNT_PASSWORD: password,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "SUPABASE_SERVICE_ROLE_KEY must be a secret key or legacy service_role key.",
    );
    expect(`${result.stdout}${result.stderr}`).not.toContain(password);
  });
});
