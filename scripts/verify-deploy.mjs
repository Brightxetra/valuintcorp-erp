import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertSupabasePublicKey,
  assertSupabaseServiceRoleKey,
  resolveSupabaseProjectIdentity,
  verifyLiveSupabaseSchema,
} from "./verify-supabase-deploy.mjs";

const args = process.argv.slice(2);
const allowedArguments = new Set(["--live", "--profile=production", "--profile=local"]);
const unknownArguments = args.filter((argument) => !allowedArguments.has(argument));
const profileArguments = args.filter((argument) => argument.startsWith("--profile="));

if (unknownArguments.length > 0 || profileArguments.length > 1) {
  const details = unknownArguments.length > 0 ? unknownArguments.join(", ") : "duplicate --profile arguments";
  console.error(`Invalid deploy verification arguments: ${details}`);
  process.exit(2);
}

const profileArgument = profileArguments[0];
const profile = profileArgument?.slice("--profile=".length) || "production";

if (!new Set(["production", "local"]).has(profile)) {
  console.error(`Unknown deploy verification profile: ${profile}`);
  process.exit(2);
}

function environmentFlagEnabled(value) {
  const normalized = value?.trim().toLowerCase();
  return Boolean(normalized && !["0", "false", "no", "off"].includes(normalized));
}

function processEnvironmentValue(name) {
  return process.env[name]?.trim() ?? "";
}

function isTrustedVercelNonProduction() {
  const vercelEnvironment = processEnvironmentValue("VERCEL_ENV");
  return (
    processEnvironmentValue("VERCEL") === "1" &&
    (vercelEnvironment === "preview" || vercelEnvironment === "development")
  );
}

function isProductionRuntime() {
  return (
    processEnvironmentValue("VERCEL_ENV") === "production" ||
    processEnvironmentValue("VALUINTCORP_DEPLOYMENT_ENV") === "production" ||
    (processEnvironmentValue("NODE_ENV") === "production" &&
      !isTrustedVercelNonProduction())
  );
}

const localProfileBlocked =
  environmentFlagEnabled(process.env.CI) ||
  processEnvironmentValue("VERCEL") === "1" ||
  Boolean(processEnvironmentValue("VERCEL_ENV")) ||
  processEnvironmentValue("VALUINTCORP_DEPLOYMENT_ENV") === "production" ||
  processEnvironmentValue("NODE_ENV") === "production";

if (profile === "local" && localProfileBlocked) {
  console.error("The local deploy verification profile cannot run in CI or a production runtime.");
  process.exit(2);
}

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

if (profile === "local") {
  loadEnvFile(".env.local");
  loadEnvFile(".env");
}

const liveCheck =
  args.includes("--live") || processEnvironmentValue("VERIFY_DEPLOY_LIVE") === "true";
const issues = [];
const warnings = [];

function requireEnv(name) {
  if (process.env[name]?.trim()) return;

  const message = `Missing env: ${name}`;
  if (profile === "production") {
    issues.push(message);
  } else {
    warnings.push(message);
  }
}

requireEnv("NEXT_PUBLIC_SUPABASE_URL");
requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
requireEnv("NEXT_PUBLIC_HCAPTCHA_SITE_KEY");
requireEnv("SUPABASE_PROJECT_REF");
requireEnv("SUPABASE_SERVICE_ROLE_KEY");
requireEnv("SUPABASE_ERP_ATTACHMENTS_BUCKET");
requireEnv("CRON_SECRET");

const configuredPublicKey = processEnvironmentValue("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const configuredServiceRoleKey = processEnvironmentValue("SUPABASE_SERVICE_ROLE_KEY");

if (configuredServiceRoleKey) {
  try {
    assertSupabaseServiceRoleKey(configuredServiceRoleKey);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Supabase service key is invalid.";
    if (!issues.includes(message)) issues.push(message);
  }
}

if (configuredPublicKey) {
  try {
    assertSupabasePublicKey(configuredPublicKey, configuredServiceRoleKey);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Supabase public key is invalid.";
    if (!issues.includes(message)) issues.push(message);
  }
}

const demoMode = processEnvironmentValue("NEXT_PUBLIC_DEMO_MODE");
const demoModeConfigured = process.env.NEXT_PUBLIC_DEMO_MODE !== undefined;

if (profile === "production" && demoMode !== "false") {
  issues.push("NEXT_PUBLIC_DEMO_MODE must be explicitly set to false for production deploy.");
} else if (
  profile === "local" &&
  demoModeConfigured &&
  !["true", "false"].includes(demoMode)
) {
  issues.push("NEXT_PUBLIC_DEMO_MODE must be either true or false.");
} else if (
  profile === "local" &&
  demoMode !== "true" &&
  (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
) {
  warnings.push("Local runtime will fail closed unless Supabase is configured or NEXT_PUBLIC_DEMO_MODE=true.");
}

if (
  profile === "production" &&
  (processEnvironmentValue("NEXT_PUBLIC_VALUINTCORP_E2E_MODE") === "true" ||
    processEnvironmentValue("VALUINTCORP_E2E_DEMO_MODE") === "true")
) {
  issues.push("E2E runtime markers must not be enabled for production deploy.");
}

const demoLoginEnabled = processEnvironmentValue("NEXT_PUBLIC_DEMO_LOGIN_ENABLED");

if (
  process.env.NEXT_PUBLIC_DEMO_LOGIN_ENABLED !== undefined &&
  !["true", "false"].includes(demoLoginEnabled)
) {
  issues.push("NEXT_PUBLIC_DEMO_LOGIN_ENABLED must be either true or false.");
} else if (demoLoginEnabled !== "true") {
  warnings.push("NEXT_PUBLIC_DEMO_LOGIN_ENABLED is not true; demo account bootstrap will be disabled.");
}

if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
    if (url.protocol !== "https:") {
      issues.push("NEXT_PUBLIC_SUPABASE_URL must use HTTPS.");
    }
  } catch {
    issues.push("NEXT_PUBLIC_SUPABASE_URL must be a valid URL.");
  }
}

if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_PROJECT_REF) {
  try {
    resolveSupabaseProjectIdentity(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_PROJECT_REF,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Supabase project identity is invalid.";
    if (!issues.includes(message)) issues.push(message);
  }
}

if (
  process.env.SUPABASE_ERP_ATTACHMENTS_BUCKET &&
  !/^[a-z0-9][a-z0-9._-]*$/i.test(process.env.SUPABASE_ERP_ATTACHMENTS_BUCKET)
) {
  issues.push("SUPABASE_ERP_ATTACHMENTS_BUCKET has an invalid name.");
}

const productionRuntime = isProductionRuntime();

if (productionRuntime && !liveCheck) {
  issues.push("Production verification requires --live or VERIFY_DEPLOY_LIVE=true.");
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
  "supabase/migrations/012_harden_supabase_security_lints.sql",
  "supabase/migrations/013_optimize_rls_policy_performance.sql",
  "supabase/migrations/014_private_authz_helpers.sql",
  "supabase/migrations/015_add_foreign_key_performance_indexes.sql",
  "supabase/migrations/016_reconciliation_rollup_rpc.sql",
  "supabase/migrations/017_workspace_route_performance.sql",
  "supabase/migrations/018_lockdown_security_definer_rpcs.sql",
  "supabase/migrations/019_branch_pos_and_member_access.sql",
  "supabase/migrations/020_api_role_table_privileges.sql",
  "supabase/migrations/021_user_login_sessions.sql",
  "supabase/migrations/022_employee_profiles_and_bpjs_policy.sql",
  "supabase/migrations/023_fix_post_hardening_rls_policies.sql",
  "supabase/migrations/024_supabase_advisor_rls_and_pos_trigger_hardening.sql",
  "supabase/migrations/025_industry_catalog_recipes_mrp.sql",
  "supabase/migrations/026_fix_document_sequence_key_ambiguity.sql",
  "supabase/migrations/027_prevent_negative_inventory_stock.sql",
  "supabase/migrations/20260705004700_auth_security_events_and_counterparty_tax_ids.sql",
  "supabase/migrations/20260719072824_harden_public_api_privileges.sql",
];

const requiredFiles = [
  ...requiredMigrations,
  "supabase/tests/public_api_privileges.test.sql",
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
requireFileSnippet("supabase/migrations/013_optimize_rls_policy_performance.sql", "('raw_transactions', 'members can read raw transactions'");
requireFileSnippet("supabase/migrations/014_private_authz_helpers.sql", "create schema if not exists app_private");
requireFileSnippet("supabase/migrations/015_add_foreign_key_performance_indexes.sql", "create index if not exists raw_transactions_location_id_fk_idx");
requireFileSnippet("supabase/migrations/016_reconciliation_rollup_rpc.sql", "create or replace function public.reconciliation_rollup");
requireFileSnippet("supabase/migrations/017_workspace_route_performance.sql", "create or replace function public.workspace_dashboard_rollup");
requireFileSnippet("supabase/migrations/018_lockdown_security_definer_rpcs.sql", "create or replace function app_private.apply_request_actor");
requireFileSnippet("supabase/migrations/018_lockdown_security_definer_rpcs.sql", "revoke execute on function public.upload_raw_transactions(jsonb) from public, anon, authenticated");
requireFileSnippet("supabase/migrations/018_lockdown_security_definer_rpcs.sql", "grant execute on function public.upload_raw_transactions(jsonb) to service_role");
requireFileSnippet("supabase/migrations/018_lockdown_security_definer_rpcs.sql", "create_business_with_owner_for_actor");
requireFileSnippet("supabase/migrations/019_branch_pos_and_member_access.sql", "create table if not exists public.branch_expenses");
requireFileSnippet("supabase/migrations/019_branch_pos_and_member_access.sql", "create or replace function public.post_pos_sale_internal");
requireFileSnippet("supabase/migrations/019_branch_pos_and_member_access.sql", "create or replace function public.post_branch_expense_internal");
requireFileSnippet("supabase/migrations/021_user_login_sessions.sql", "create table if not exists public.user_login_sessions");
requireFileSnippet("supabase/migrations/021_user_login_sessions.sql", "session_token_hash text not null unique");
requireFileSnippet("supabase/migrations/022_employee_profiles_and_bpjs_policy.sql", "create table if not exists public.bpjs_policies");
requireFileSnippet("supabase/migrations/023_fix_post_hardening_rls_policies.sql", "alter policy \"hr and finance can read bpjs policies\"");
requireFileSnippet("supabase/migrations/024_supabase_advisor_rls_and_pos_trigger_hardening.sql", "alter function public.ensure_pos_walk_in_customer() set schema app_private");
requireFileSnippet("supabase/migrations/025_industry_catalog_recipes_mrp.sql", "create table if not exists public.product_structures");
requireFileSnippet("supabase/migrations/025_industry_catalog_recipes_mrp.sql", "create or replace function public.product_unit_cost");
requireFileSnippet("supabase/migrations/026_fix_document_sequence_key_ambiguity.sql", "target_sequence_key text");
requireFileSnippet("supabase/migrations/026_fix_document_sequence_key_ambiguity.sql", "grant execute on function public.next_document_no(uuid, text) to service_role");
requireFileSnippet("supabase/migrations/027_prevent_negative_inventory_stock.sql", "create or replace function public.current_stock_value");
requireFileSnippet("supabase/migrations/027_prevent_negative_inventory_stock.sql", "new.type in ('sale', 'transfer_out', 'adjustment_out')");
requireFileSnippet("supabase/migrations/027_prevent_negative_inventory_stock.sql", "Nilai stok tidak cukup");
requireFileSnippet("supabase/migrations/027_prevent_negative_inventory_stock.sql", "for each row execute function public.ensure_stock_movement_consistency()");
requireFileSnippet("supabase/migrations/20260705004700_auth_security_events_and_counterparty_tax_ids.sql", "create table if not exists public.auth_security_events");
requireFileSnippet("supabase/migrations/20260705004700_auth_security_events_and_counterparty_tax_ids.sql", "auth_security_events_email_window_idx");
requireFileSnippet("supabase/migrations/20260705004700_auth_security_events_and_counterparty_tax_ids.sql", "revoke all on public.auth_security_events from public, anon, authenticated");
requireFileSnippet("supabase/migrations/20260705004700_auth_security_events_and_counterparty_tax_ids.sql", "add column if not exists tax_id text");
requireFileSnippet("supabase/migrations/20260719072824_harden_public_api_privileges.sql", "alter default privileges for role postgres in schema public");
requireFileSnippet("supabase/migrations/20260719072824_harden_public_api_privileges.sql", "revoke all privileges on tables");
requireFileSnippet("supabase/migrations/20260719072824_harden_public_api_privileges.sql", "revoke all privileges on sequences");
requireFileSnippet("supabase/migrations/20260719072824_harden_public_api_privileges.sql", "revoke execute on functions");
requireFileSnippet("supabase/migrations/20260719072824_harden_public_api_privileges.sql", "revoke truncate, references, trigger, maintain");
requireFileSnippet("supabase/migrations/20260719072824_harden_public_api_privileges.sql", "revoke all privileges on table");
requireFileSnippet("supabase/migrations/20260719072824_harden_public_api_privileges.sql", "grant select, insert on table public.activity_events");
requireFileSnippet("supabase/tests/public_api_privileges.test.sql", "has_table_privilege");
requireFileSnippet("supabase/tests/public_api_privileges.test.sql", "has_sequence_privilege");
requireFileSnippet("supabase/tests/public_api_privileges.test.sql", "has_function_privilege");
requireFileSnippet("supabase/tests/public_api_privileges.test.sql", "create extension if not exists pgtap with schema extensions");
requireFileSnippet("supabase/tests/public_api_privileges.test.sql", "rollback;");

if (existsSync(join(process.cwd(), "vercel.json"))) {
  const vercelConfig = readFileSync(join(process.cwd(), "vercel.json"), "utf8");
  if (!vercelConfig.includes("/api/ops/demo-reset")) {
    issues.push("vercel.json must include cron path /api/ops/demo-reset.");
  }
}

async function runLiveSchemaCheck() {
  if (!liveCheck) {
    warnings.push("Live Supabase schema check skipped. Use --live to verify production tables.");
    return;
  }

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    !process.env.SUPABASE_PROJECT_REF ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    issues.push(
      "VERIFY_DEPLOY_LIVE=true requires NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_PROJECT_REF, and SUPABASE_SERVICE_ROLE_KEY.",
    );
    return;
  }

  try {
    const { tableIssues } = await verifyLiveSupabaseSchema({
      projectRef: process.env.SUPABASE_PROJECT_REF,
      publicKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    });

    issues.push(...tableIssues);
    if (tableIssues.length === 0) {
      warnings.push(
        "Live check proves the configured frontend key/project pairing and bounded canonical Supabase service-role table reachability; migration history, effective grants/RLS, RPCs, triggers, and Storage policies remain separate release gates.",
      );
    }
  } catch (error) {
    issues.push(error instanceof Error ? error.message : "Supabase public API check failed.");
    return;
  }
}

await runLiveSchemaCheck();

console.log(`Deploy verification profile: ${profile}. Live check: ${liveCheck ? "enabled" : "disabled"}.`);

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

if (issues.length > 0) {
  process.exitCode = 1;
}
