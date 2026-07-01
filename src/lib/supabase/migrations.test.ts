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
const actorServiceRpcs = [
  ...sensitiveJsonbRpcs,
  "post_pos_sale",
  "post_branch_expense",
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
  it("keeps production ERP migrations in order through 027", () => {
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
      "021_user_login_sessions.sql",
      "022_employee_profiles_and_bpjs_policy.sql",
      "023_fix_post_hardening_rls_policies.sql",
      "024_supabase_advisor_rls_and_pos_trigger_hardening.sql",
      "025_industry_catalog_recipes_mrp.sql",
      "026_fix_document_sequence_key_ambiguity.sql",
      "027_prevent_negative_inventory_stock.sql",
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

  it("tracks app login sessions for idle timeout and device logout", () => {
    const migration = readFileSync(join(migrationsDir, "021_user_login_sessions.sql"), "utf8");

    expect(migration).toContain("create table if not exists public.user_login_sessions");
    expect(migration).toContain("session_token_hash text not null unique");
    expect(migration).toContain("remember_me boolean not null default false");
    expect(migration).toContain("alter table public.user_login_sessions enable row level security");
    expect(migration).toContain("users can read own login sessions");
    expect(migration).toContain("revoke insert, update, delete on public.user_login_sessions from authenticated");
    expect(migration).toContain("grant select on public.user_login_sessions to authenticated");
    expect(migration).toContain("grant select, insert, update, delete on public.user_login_sessions to service_role");
  });


  it("adds employee profile fields and configurable BPJS policy", () => {
    const migration = readFileSync(join(migrationsDir, "022_employee_profiles_and_bpjs_policy.sql"), "utf8");

    expect(migration).toContain("add column if not exists department text");
    expect(migration).toContain("add column if not exists bank_account_no text");
    expect(migration).toContain("add column if not exists bpjs_employment_no text");
    expect(migration).toContain("create table if not exists public.bpjs_policies");
    expect(migration).toContain("health_employee_rate numeric(8, 6) not null default 0.01");
    expect(migration).toContain("jkk_employer_rate numeric(8, 6) not null default 0.0054");
    expect(migration).toContain("alter table public.bpjs_policies enable row level security");
    expect(migration).toContain("hr can manage bpjs policies");
    expect(migration).toContain("app_private.has_business_role");
    expect(migration).toContain("grant select, insert, update, delete on public.bpjs_policies to authenticated, service_role");
  });

  it("keeps policies added after authorization hardening on private helpers", () => {
    const branchMigration = readFileSync(join(migrationsDir, "019_branch_pos_and_member_access.sql"), "utf8");
    const repairMigration = readFileSync(join(migrationsDir, "023_fix_post_hardening_rls_policies.sql"), "utf8");

    expect(branchMigration).toContain("app_private.is_business_member(business_id)");
    expect(branchMigration).toContain("app_private.has_business_role(business_id");
    expect(branchMigration).not.toContain("public.has_business_role(business_id");
    expect(repairMigration).toContain("alter policy \"hr and finance can read bpjs policies\"");
    expect(repairMigration).toContain("app_private.has_business_role(business_id");
  });

  it("resolves Supabase Advisor RLS and exposed POS trigger findings", () => {
    const migration = readFileSync(join(migrationsDir, "024_supabase_advisor_rls_and_pos_trigger_hardening.sql"), "utf8");

    expect(migration).toContain('drop policy if exists "hr can manage bpjs policies"');
    expect(migration).toContain('on public.bpjs_policies for select');
    expect(migration).toContain('on public.bpjs_policies for insert');
    expect(migration).toContain('on public.bpjs_policies for update');
    expect(migration).toContain('on public.bpjs_policies for delete');
    expect(migration).toContain('drop policy if exists "owners can manage branch expenses"');
    expect(migration).toContain('on public.branch_expenses for select');
    expect(migration).toContain('on public.branch_expenses for insert');
    expect(migration).toContain('on public.branch_expenses for update');
    expect(migration).toContain('on public.branch_expenses for delete');
    expect(migration).toContain("alter function public.ensure_pos_walk_in_customer() set schema app_private");
    expect(migration).toContain("revoke all on function app_private.ensure_pos_walk_in_customer() from public");
  });

  it("adds industry catalog, recipes, BOM, MRP, and recipe-aware POS costing", () => {
    const migration = readFileSync(join(migrationsDir, "025_industry_catalog_recipes_mrp.sql"), "utf8");

    expect(migration).toContain("add column if not exists industry_item_type");
    expect(migration).toContain("add column if not exists fulfillment_method");
    expect(migration).toContain("create table if not exists public.product_structures");
    expect(migration).toContain("create table if not exists public.product_structure_lines");
    expect(migration).toContain("create table if not exists public.demand_forecasts");
    expect(migration).toContain("create table if not exists public.mrp_runs");
    expect(migration).toContain("create table if not exists public.mrp_recommendations");
    expect(migration).toContain("create table if not exists public.production_orders");
    expect(migration).toContain("app_private.has_business_role");
    expect(migration).toContain("create or replace function public.product_unit_cost");
    expect(migration).toContain("product_record.fulfillment_method = 'recipe_on_sale'");
    expect(migration).toContain("Insufficient ingredient stock at this branch.");
  });

  it("fixes document sequence generation without reopening public execution", () => {
    const migration = readFileSync(join(migrationsDir, "026_fix_document_sequence_key_ambiguity.sql"), "utf8");

    expect(migration).toContain("create or replace function public.next_document_no");
    expect(migration).toContain("target_sequence_key text");
    expect(migration).not.toMatch(/\n\s+sequence_key\s+text;/);
    expect(migration).toContain("values (target_business_id, target_sequence_key, 2)");
    expect(migration).toContain("on conflict (business_id, sequence_key)");
    expect(migration).toContain("return target_sequence_key || '-' || lpad(current_value::text, 4, '0')");
    expect(migration).toContain("revoke execute on function public.next_document_no(uuid, text) from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.next_document_no(uuid, text) to service_role");
  });

  it("prevents new stock movements from creating negative quantity or value", () => {
    const migration = readFileSync(join(migrationsDir, "027_prevent_negative_inventory_stock.sql"), "utf8");

    expect(migration).toContain("create or replace function public.current_stock_value");
    expect(migration).toContain("create or replace function public.ensure_stock_movement_consistency");
    expect(migration).toContain("new.type in ('sale', 'transfer_out', 'adjustment_out')");
    expect(migration).toContain("public.current_stock_quantity(new.business_id, new.item_id, new.warehouse_id)");
    expect(migration).toContain("public.current_stock_value(new.business_id, new.item_id, new.warehouse_id)");
    expect(migration).toContain("Stock tidak cukup");
    expect(migration).toContain("Nilai stok tidak cukup");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("drop trigger if exists prevent_locked_stock_movements on public.stock_movements");
    expect(migration).toContain("for each row execute function public.ensure_stock_movement_consistency()");
    expect(migration).toContain("revoke execute on function public.current_stock_value(uuid, uuid, uuid) from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.current_stock_value(uuid, uuid, uuid) to service_role");
  });

  it("routes sensitive ERP mutations through the service-role RPC helper", () => {
    const apiDir = join(process.cwd(), "src", "app", "api", "erp");
    const apiContents = readFilesRecursive(apiDir)
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    const helper = readFileSync(join(process.cwd(), "src", "lib", "supabase", "service-rpc.ts"), "utf8");

    for (const rpc of actorServiceRpcs) {
      expect(apiContents).not.toContain(`.rpc("${rpc}"`);
    }

    expect(apiContents).not.toContain(`.rpc("create_business_with_owner",`);
    expect(apiContents).toContain(`.rpc("create_business_with_owner_for_actor"`);
    expect(helper).toContain("createServiceSupabaseClient");
    expect(helper).toContain("actorUserId");
  });
});
