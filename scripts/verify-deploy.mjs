import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(fileName) {
  const filePath = join(process.cwd(), fileName);
  if (!existsSync(filePath)) return;

  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const strict = process.env.VERIFY_DEPLOY_STRICT === "true";
const liveCheck = process.env.VERIFY_DEPLOY_LIVE === "true";
const issues = [];
const warnings = [];

function requireEnv(name) {
  if (!process.env[name]) issues.push(`Missing env: ${name}`);
}

requireEnv("NEXT_PUBLIC_SUPABASE_URL");
requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
requireEnv("SUPABASE_SERVICE_ROLE_KEY");
requireEnv("SUPABASE_ERP_ATTACHMENTS_BUCKET");
requireEnv("CRON_SECRET");

if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
  issues.push("NEXT_PUBLIC_DEMO_MODE must be false for production deploy.");
}

if (process.env.NEXT_PUBLIC_DEMO_LOGIN_ENABLED !== "true") {
  warnings.push("NEXT_PUBLIC_DEMO_LOGIN_ENABLED is not true; demo account bootstrap will be disabled.");
}

const requiredMigrations = [
  "supabase/migrations/001_initial_schema.sql",
  "supabase/migrations/002_security_and_integrity_hardening.sql",
  "supabase/migrations/003_erp_core_tables.sql",
  "supabase/migrations/004_erp_production_hardening.sql",
  "supabase/migrations/005_erp_workspace_bootstrap_and_workflows.sql",
  "supabase/migrations/006_horizontal_erp_scale_layer.sql",
  "supabase/migrations/007_production_ops_and_storage.sql",
  "supabase/migrations/008_demo_sandbox_and_deploy_readiness.sql",
  "supabase/migrations/009_business_logo_profile.sql",
  "supabase/migrations/010_fixed_assets.sql",
  "supabase/migrations/011_authenticated_api_privileges.sql",
];

const requiredFiles = [
  ...requiredMigrations,
  "src/app/api/demo/bootstrap/route.ts",
  "src/app/api/ops/demo-reset/route.ts",
  "src/app/api/erp/business-logo/signed-upload/route.ts",
  "vercel.json",
];

for (const file of requiredFiles) {
  if (!existsSync(join(process.cwd(), file))) issues.push(`Missing file: ${file}`);
}

function requireFileSnippet(file, snippet) {
  const filePath = join(process.cwd(), file);
  if (!existsSync(filePath)) return;
  const contents = readFileSync(filePath, "utf8");
  if (!contents.includes(snippet)) issues.push(`Missing migration snippet in ${file}: ${snippet}`);
}

requireFileSnippet("supabase/migrations/007_production_ops_and_storage.sql", "create table if not exists public.member_invites");
requireFileSnippet("supabase/migrations/007_production_ops_and_storage.sql", "create table if not exists public.transaction_source_mappings");
requireFileSnippet("supabase/migrations/010_fixed_assets.sql", "create table if not exists public.fixed_assets");
requireFileSnippet("supabase/migrations/011_authenticated_api_privileges.sql", "grant usage on schema public to authenticated");

if (existsSync(join(process.cwd(), "vercel.json"))) {
  const vercelConfig = readFileSync(join(process.cwd(), "vercel.json"), "utf8");
  if (!vercelConfig.includes("/api/ops/demo-reset")) {
    issues.push("vercel.json must include cron path /api/ops/demo-reset.");
  }
}

async function runLiveSchemaCheck() {
  if (!liveCheck) {
    warnings.push("Live Supabase schema check skipped. Set VERIFY_DEPLOY_LIVE=true to verify production tables.");
    return;
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    issues.push("VERIFY_DEPLOY_LIVE=true requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    return;
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const requiredTables = [
    "businesses",
    "business_members",
    "member_invites",
    "locations",
    "transaction_sources",
    "demo_sandboxes",
    "fixed_assets",
  ];

  for (const table of requiredTables) {
    const { error } = await supabase.from(table).select("id", { head: true, count: "exact" }).limit(1);

    if (error) {
      issues.push(`Live Supabase table check failed for public.${table}: ${error.message}`);
    }
  }
}

await runLiveSchemaCheck();

if (issues.length === 0) {
  console.log("Deploy verification passed.");
} else {
  console.log("Deploy verification found issues:");
  for (const issue of issues) console.log(`- ${issue}`);
}

if (warnings.length > 0) {
  console.log("Warnings:");
  for (const warning of warnings) console.log(`- ${warning}`);
}

if (strict && issues.length > 0) {
  process.exit(1);
}
