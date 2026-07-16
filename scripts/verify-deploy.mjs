import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

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

const localProfileBlocked =
  environmentFlagEnabled(process.env.CI) ||
  process.env.VERCEL === "1" ||
  Boolean(process.env.VERCEL_ENV) ||
  process.env.VALUINTCORP_DEPLOYMENT_ENV === "production" ||
  process.env.NODE_ENV === "production";

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

const liveCheck = args.includes("--live") || process.env.VERIFY_DEPLOY_LIVE === "true";
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
requireEnv("SUPABASE_SERVICE_ROLE_KEY");
requireEnv("SUPABASE_ERP_ATTACHMENTS_BUCKET");
requireEnv("CRON_SECRET");

if (profile === "production" && process.env.NEXT_PUBLIC_DEMO_MODE !== "false") {
  issues.push("NEXT_PUBLIC_DEMO_MODE must be explicitly set to false for production deploy.");
} else if (
  profile === "local" &&
  process.env.NEXT_PUBLIC_DEMO_MODE !== undefined &&
  !["true", "false"].includes(process.env.NEXT_PUBLIC_DEMO_MODE)
) {
  issues.push("NEXT_PUBLIC_DEMO_MODE must be either true or false.");
} else if (
  profile === "local" &&
  process.env.NEXT_PUBLIC_DEMO_MODE !== "true" &&
  (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
) {
  warnings.push("Local runtime will fail closed unless Supabase is configured or NEXT_PUBLIC_DEMO_MODE=true.");
}

if (
  profile === "production" &&
  (process.env.NEXT_PUBLIC_VALUINTCORP_E2E_MODE === "true" ||
    process.env.VALUINTCORP_E2E_DEMO_MODE === "true")
) {
  issues.push("E2E runtime markers must not be enabled for production deploy.");
}

if (
  process.env.NEXT_PUBLIC_DEMO_LOGIN_ENABLED !== undefined &&
  !["true", "false"].includes(process.env.NEXT_PUBLIC_DEMO_LOGIN_ENABLED)
) {
  issues.push("NEXT_PUBLIC_DEMO_LOGIN_ENABLED must be either true or false.");
} else if (process.env.NEXT_PUBLIC_DEMO_LOGIN_ENABLED !== "true") {
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

if (
  process.env.SUPABASE_ERP_ATTACHMENTS_BUCKET &&
  !/^[a-z0-9][a-z0-9._-]*$/i.test(process.env.SUPABASE_ERP_ATTACHMENTS_BUCKET)
) {
  issues.push("SUPABASE_ERP_ATTACHMENTS_BUCKET has an invalid name.");
}

const hostedProduction =
  process.env.VERCEL_ENV === "production" ||
  process.env.VALUINTCORP_DEPLOYMENT_ENV === "production";

if (hostedProduction && !liveCheck) {
  issues.push("Hosted production verification requires --live or VERIFY_DEPLOY_LIVE=true.");
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
  "supabase/migrations/028_auth_security_events_and_counterparty_tax_ids.sql",
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
requireFileSnippet("supabase/migrations/028_auth_security_events_and_counterparty_tax_ids.sql", "create table if not exists public.auth_security_events");
requireFileSnippet("supabase/migrations/028_auth_security_events_and_counterparty_tax_ids.sql", "auth_security_events_email_window_idx");
requireFileSnippet("supabase/migrations/028_auth_security_events_and_counterparty_tax_ids.sql", "revoke all on public.auth_security_events from public, anon, authenticated");
requireFileSnippet("supabase/migrations/028_auth_security_events_and_counterparty_tax_ids.sql", "add column if not exists tax_id text");

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

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    issues.push("VERIFY_DEPLOY_LIVE=true requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    return;
  }

  async function fetchWithTimeout(input, init = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    global: { fetch: fetchWithTimeout },
  });
  const requiredTables = [
    "businesses",
    "business_members",
    "member_invites",
    "locations",
    "transaction_sources",
    "demo_sandboxes",
    "fixed_assets",
    "raw_transactions",
    "daily_transaction_summaries",
    "settlement_records",
    "attachments",
    "branch_expenses",
    "user_login_sessions",
    "auth_security_events",
  ];

  const tableIssues = await Promise.all(
    requiredTables.map(async (table) => {
      const { error } = await supabase.from(table).select("id", { head: true }).limit(1);
      return error ? `Live Supabase table check failed for public.${table}: ${error.message}` : null;
    }),
  );

  issues.push(...tableIssues.filter(Boolean));
  warnings.push("Live check currently proves table reachability only; migration history, effective grants, RLS, RPC, triggers, Storage policies, and project identity still require the planned deployment-health contract.");
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
