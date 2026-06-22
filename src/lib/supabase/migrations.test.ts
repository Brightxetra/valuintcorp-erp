import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = join(process.cwd(), "supabase", "migrations");
const sensitiveJsonbRpcs = [
  "apply_industry_template",
  "post_daily_summary",
  "post_fixed_asset",
  "post_fixed_asset_depreciation_run",
  "post_fixed_asset_disposal",
  "post_payment",
  "post_purchase_bill",
  "post_sales_invoice",
  "post_stock_adjustment",
  "post_stock_transfer",
  "reverse_fixed_asset_document",
  "rollback_daily_summary",
  "run_payroll",
  "set_report_period_lock",
  "summarize_raw_import_batch",
  "update_fixed_asset",
  "upload_raw_transactions",
  "validate_raw_import_batch",
  "void_document",
];

function readFilesRecursive(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      return readFilesRecursive(fullPath);
    }

    return entry.isFile() && entry.name.endsWith(".ts") ? [fullPath] : [];
  });
}

describe("Supabase migration contract", () => {
  it("keeps production ERP migrations in order through 020", () => {
    const files = readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort();

    expect(files).toEqual([
      "001_initial_schema.sql",
      "002_security_and_integrity_hardening.sql",
      "003_erp_core_tables.sql",
      "004_erp_production_hardening.sql",
      "005_erp_workspace_bootstrap_and_workflows.sql",
      "006_horizontal_erp_scale_layer.sql",
      "007_production_ops_and_storage.sql",
      "008_demo_sandbox_and_deploy_readiness.sql",
      "009_business_logo_profile.sql",
      "010_fixed_assets.sql",
      "011_authenticated_api_privileges.sql",
      "012_harden_supabase_security_lints.sql",
      "013_optimize_rls_policy_performance.sql",
      "014_private_authz_helpers.sql",
      "015_add_foreign_key_performance_indexes.sql",
      "016_reconciliation_rollup_rpc.sql",
      "017_workspace_route_performance.sql",
      "018_lockdown_security_definer_rpcs.sql",
      "019_branch_pos_and_member_access.sql",
      "020_api_role_table_privileges.sql",
    ]);
  });

  it("includes production ops tables, storage bucket, and tenant policies", () => {
    const migration = readFileSync(join(migrationsDir, "007_production_ops_and_storage.sql"), "utf8");

    expect(migration).toContain("create table if not exists public.member_invites");
    expect(migration).toContain("create table if not exists public.transaction_source_mappings");
    expect(migration).toContain("create or replace function public.accept_member_invite");
    expect(migration).toContain("create or replace function public.ensure_attachment_owner_business");
    expect(migration).toContain("insert into storage.buckets");
    expect(migration).toContain("public.has_business_role(((storage.foldername(name))[1])::uuid");
  });

  it("includes demo sandbox accounts, reset RPCs, and service-role grants", () => {
    const migration = readFileSync(join(migrationsDir, "008_demo_sandbox_and_deploy_readiness.sql"), "utf8");

    expect(migration).toContain("create table if not exists public.demo_user_accounts");
    expect(migration).toContain("create table if not exists public.demo_sandboxes");
    expect(migration).toContain("create or replace function public.bootstrap_demo_sandbox");
    expect(migration).toContain("create or replace function public.reset_due_demo_sandboxes");
    expect(migration).toContain("grant execute on function public.reset_demo_sandbox(uuid) to service_role");
  });

  it("includes business logo profile storage pointer", () => {
    const migration = readFileSync(join(migrationsDir, "009_business_logo_profile.sql"), "utf8");

    expect(migration).toContain("add column if not exists logo_url text");
  });

  it("includes fixed asset tables, posting RPCs, and attachment support", () => {
    const migration = readFileSync(join(migrationsDir, "010_fixed_assets.sql"), "utf8");

    expect(migration).toContain("create table if not exists public.fixed_assets");
    expect(migration).toContain("create table if not exists public.fixed_asset_depreciation_runs");
    expect(migration).toContain("create or replace function public.post_fixed_asset");
    expect(migration).toContain("create or replace function public.post_fixed_asset_depreciation_run");
    expect(migration).toContain("create or replace function public.post_fixed_asset_disposal");
    expect(migration).toContain("create or replace function public.reverse_fixed_asset_document");
    expect(migration).toContain("'fixed_asset'");
  });

  it("includes authenticated API privileges for deployed Supabase projects", () => {
    const migration = readFileSync(join(migrationsDir, "011_authenticated_api_privileges.sql"), "utf8");

    expect(migration).toContain("grant usage on schema public to authenticated");
    expect(migration).toContain("grant select, insert, update, delete on all tables in schema public to authenticated");
  });

  it("includes Supabase security lint hardening", () => {
    const migration = readFileSync(join(migrationsDir, "012_harden_supabase_security_lints.sql"), "utf8");

    expect(migration).toContain("alter function public.ensure_journal_entry_complete() set search_path = public");
    expect(migration).toContain("revoke execute on function public.post_sales_invoice(jsonb) from public, anon, authenticated");
    expect(migration).toContain("revoke execute on function public.require_posting_role(uuid, text[]) from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.require_posting_role(uuid, text[]) to service_role");
    expect(migration).toContain("to_regprocedure('public.rls_auto_enable()')");
  });

  it("includes Supabase RLS performance lint optimization", () => {
    const migration = readFileSync(join(migrationsDir, "013_optimize_rls_policy_performance.sql"), "utf8");

    expect(migration).toContain("for select to authenticated");
    expect(migration).toContain("using ((select auth.uid()) is not null)");
    expect(migration).toContain("drop policy if exists \"demo users can read own account\"");
    expect(migration).toContain("policy_rule.manage_policy || ' insert'");
    expect(migration).toContain("policy_rule.manage_policy || ' update'");
    expect(migration).toContain("policy_rule.manage_policy || ' delete'");
    expect(migration).toContain("'sales_invoices', 'members can read sales invoices'");
    expect(migration).toContain("'fixed_assets', 'members can read fixed assets'");
  });

  it("moves authz helpers out of the exposed public RPC surface", () => {
    const migration = readFileSync(join(migrationsDir, "014_private_authz_helpers.sql"), "utf8");

    expect(migration).toContain("create schema if not exists app_private");
    expect(migration).toContain("create or replace function app_private.member_role");
    expect(migration).toContain("create or replace function app_private.is_business_member");
    expect(migration).toContain("create or replace function app_private.has_business_role");
    expect(migration).toContain("role := app_private.member_role(target_business_id)");
    expect(migration).toContain("pg_policy policy");
    expect(migration).toContain("app_private.has_business_role");
    expect(migration).toContain("revoke execute on function public.has_business_role(uuid, text[]) from public, anon, authenticated");
    expect(migration).toContain("revoke execute on function public.accept_member_invite(uuid) from public, anon, authenticated");
  });

  it("adds explicit foreign key performance indexes without dropping workload indexes", () => {
    const migration = readFileSync(join(migrationsDir, "015_add_foreign_key_performance_indexes.sql"), "utf8");

    expect(migration).toContain("create index if not exists sales_invoice_lines_sales_invoice_id_fk_idx");
    expect(migration).toContain("create index if not exists purchase_bill_lines_purchase_bill_id_fk_idx");
    expect(migration).toContain("create index if not exists journal_lines_journal_entry_id_fk_idx");
    expect(migration).toContain("create index if not exists stock_movements_item_id_fk_idx");
    expect(migration).toContain("create index if not exists raw_transaction_lines_raw_transaction_id_fk_idx");
    expect(migration).toContain("create index if not exists fixed_asset_depreciation_lines_asset_id_fk_idx");
    expect(migration).not.toContain("drop index");
  });

  it("adds bounded reconciliation rollup RPC", () => {
    const migration = readFileSync(join(migrationsDir, "016_reconciliation_rollup_rpc.sql"), "utf8");

    expect(migration).toContain("create or replace function public.reconciliation_rollup");
    expect(migration).toContain("limit least(greatest(coalesce(result_limit, 500), 1), 500)");
    expect(migration).toContain("from public.raw_transactions raw");
    expect(migration).toContain("from public.settlement_records settlement");
    expect(migration).toContain("grant execute on function public.reconciliation_rollup");
  });

  it("adds workspace route performance rollup RPC without dropping indexes", () => {
    const migration = readFileSync(join(migrationsDir, "017_workspace_route_performance.sql"), "utf8");

    expect(migration).toContain("create or replace function public.workspace_dashboard_rollup");
    expect(migration).toContain("returns table");
    expect(migration).toContain("from public.daily_transaction_summaries");
    expect(migration).toContain("where public.is_business_member(target_business_id)");
    expect(migration).toContain("grant execute on function public.workspace_dashboard_rollup");
    expect(migration).not.toContain("drop index");
  });

  it("locks sensitive SECURITY DEFINER RPCs behind service-role API calls", () => {
    const migration = readFileSync(join(migrationsDir, "018_lockdown_security_definer_rpcs.sql"), "utf8");

    expect(migration).toContain("create or replace function app_private.apply_request_actor(actor_user_id uuid)");
    expect(migration).toContain("jwt_role is distinct from 'service_role'");
    expect(migration).toContain("create or replace function public.create_business_with_owner_for_actor");
    expect(migration).toContain(
      "revoke execute on function public.create_business_with_owner(text, text, text, text, text) from public, anon, authenticated",
    );
    expect(migration).toContain(
      "grant execute on function public.create_business_with_owner_for_actor(text, text, text, text, text, uuid) to service_role",
    );

    for (const rpc of sensitiveJsonbRpcs) {
      expect(migration).toContain(`alter function public.${rpc}(jsonb) rename to ${rpc}_internal`);
      expect(migration).toContain(`revoke execute on function public.${rpc}(jsonb) from public, anon, authenticated`);
      expect(migration).toContain(`grant execute on function public.${rpc}(jsonb) to service_role`);
      expect(migration).not.toContain(`grant execute on function public.${rpc}(jsonb) to authenticated`);
    }
  });

  it("adds branch POS posting, consolidated journals, and custom member access", () => {
    const migration = readFileSync(join(migrationsDir, "019_branch_pos_and_member_access.sql"), "utf8");

    expect(migration).toContain("add column if not exists access_scope text not null default 'role'");
    expect(migration).toContain("add column if not exists access_permissions text[] not null default '{}'::text[]");
    expect(migration).toContain("create table if not exists public.branch_expenses");
    expect(migration).toContain("create or replace function app_private.require_pos_access");
    expect(migration).toContain("create or replace function public.post_pos_sale_internal");
    expect(migration).toContain("customer.code = 'POS-UMUM'");
    expect(migration).toContain("'4000'");
    expect(migration).toContain("'5000'");
    expect(migration).toContain("'1200'");
    expect(migration).toContain("create or replace function public.post_branch_expense_internal");
    expect(migration).toContain("'5100'");
    expect(migration).toContain("revoke execute on function public.post_pos_sale(jsonb) from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.post_pos_sale(jsonb) to service_role");
  });
  it("grants API role table privileges for current and future public tables", () => {
    const migration = readFileSync(join(migrationsDir, "020_api_role_table_privileges.sql"), "utf8");

    expect(migration).toContain("grant usage on schema public to authenticated, service_role");
    expect(migration).toContain("grant select, insert, update, delete on all tables in schema public to authenticated, service_role");
    expect(migration).toContain("grant usage, select on all sequences in schema public to authenticated, service_role");
    expect(migration).toContain("alter default privileges in schema public");
    expect(migration).toContain("grant select, insert, update, delete on tables to authenticated, service_role");
  });

  it("routes sensitive ERP mutations through the service-role RPC helper", () => {
    const apiDir = join(process.cwd(), "src", "app", "api", "erp");
    const apiContents = readFilesRecursive(apiDir)
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    const helper = readFileSync(join(process.cwd(), "src", "lib", "supabase", "service-rpc.ts"), "utf8");

    for (const rpc of sensitiveJsonbRpcs) {
      expect(apiContents).not.toContain(`.rpc("${rpc}"`);
    }

    expect(apiContents).not.toContain(`.rpc("create_business_with_owner",`);
    expect(apiContents).toContain(`.rpc("create_business_with_owner_for_actor"`);
    expect(helper).toContain("createServiceSupabaseClient");
    expect(helper).toContain("actorUserId");
  });
});
