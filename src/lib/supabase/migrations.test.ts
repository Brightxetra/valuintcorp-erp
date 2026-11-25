import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = join(process.cwd(), "supabase", "migrations");
const aclMigrationFile = "20260719072824_harden_public_api_privileges.sql";
const stockReceiptMigrationFile = "20260719081805_stock_receipt_service_rpc.sql";
const stockReceiptIndexMigrationFile =
  "20260722033028_stock_receipt_operation_key_unique_index.sql";
const stockReceiptActivationMigrationFile =
  "20260722033031_activate_stock_receipt_service_rpc.sql";
const inventoryMutationHardeningMigrationFile =
  "20260723071330_harden_inventory_mutation_locking.sql";
const stockMovementIdentityValidationMigrationFile =
  "20260723071331_validate_stock_movement_operation_identity.sql";
const memberInviteAuthorityMigrationFile =
  "20260821070246_harden_member_invite_authority.sql";
const bpjsPolicyAuthorizationMigrationFile =
  "20260821074131_harden_bpjs_policy_authorization.sql";
const posAuthoritativePricingMigrationFile =
  "20260821083243_enforce_authoritative_pos_pricing.sql";
const financialDocumentCommandOnlyMigrationFile =
  "20260821085938_enforce_command_only_financial_documents.sql";
const inventoryDocumentCommandOnlyMigrationFile =
  "20260821093118_enforce_command_only_inventory_documents.sql";
const sensitiveReadBoundariesMigrationFile =
  "20260821100726_enforce_sensitive_read_boundaries.sql";
const loginSessionBindingMigrationFile =
  "20260821104115_bind_login_sessions_to_supabase_sessions.sql";
const documentSequenceAuthorityMigrationFile =
  "20260821110627_harden_document_sequence_authority.sql";
const aclRehearsalFile = join(
  process.cwd(),
  "supabase",
  "tests",
  "public_api_privileges.test.sql",
);
const inventoryMutationRehearsalFile = join(
  process.cwd(),
  "supabase",
  "tests",
  "inventory_mutation_hardening.test.sql",
);
const memberInviteAuthorityRehearsalFile = join(
  process.cwd(),
  "supabase",
  "tests",
  "member_invite_authority.test.sql",
);
const bpjsPolicyAuthorizationRehearsalFile = join(
  process.cwd(),
  "supabase",
  "tests",
  "bpjs_policy_authorization.test.sql",
);
const posAuthoritativePricingRehearsalFile = join(
  process.cwd(),
  "supabase",
  "tests",
  "pos_authoritative_pricing.test.sql",
);
const financialDocumentCommandOnlyRehearsalFile = join(
  process.cwd(),
  "supabase",
  "tests",
  "financial_document_command_only.test.sql",
);
const inventoryDocumentCommandOnlyRehearsalFile = join(
  process.cwd(),
  "supabase",
  "tests",
  "inventory_document_command_only.test.sql",
);
const sensitiveReadBoundariesRehearsalFile = join(
  process.cwd(),
  "supabase",
  "tests",
  "sensitive_read_boundaries.test.sql",
);
const loginSessionBindingRehearsalFile = join(
  process.cwd(),
  "supabase",
  "tests",
  "login_session_binding.test.sql",
);
const documentSequenceAuthorityRehearsalFile = join(
  process.cwd(),
  "supabase",
  "tests",
  "document_sequence_authority.test.sql",
);
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
  "post_pos_sale_v2",
  "post_branch_expense",
  "post_stock_receipt",
  "upsert_bpjs_policy",
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

function normalizeSql(sql: string): string {
  return sql.replace(/--.*$/gm, "").replace(/\s+/g, " ").trim().toLowerCase();
}

describe("Supabase migration contract", () => {
  it("uses unique, ascending migration versions and timestamped versions after the live baseline", () => {
    const files = readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort();

    for (const file of files) {
      expect(file).toMatch(/^(\d{3}|\d{14})_[a-z0-9_]+\.sql$/);
    }

    const versions = files.map((file) => Number(file.split("_", 1)[0]));
    expect(new Set(versions).size).toBe(versions.length);
    expect(versions).toEqual([...versions].sort((left, right) => left - right));

    const liveBaselineIndex = files.indexOf(
      "20260705004700_auth_security_events_and_counterparty_tax_ids.sql",
    );
    expect(liveBaselineIndex).toBeGreaterThanOrEqual(0);
    expect(files.slice(liveBaselineIndex + 1).every((file) => /^\d{14}_/.test(file))).toBe(true);
  });

  it("keeps migrations 001 through 027 followed by timestamped migrations", () => {
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
      "20260705004700_auth_security_events_and_counterparty_tax_ids.sql",
      aclMigrationFile,
      stockReceiptMigrationFile,
      stockReceiptIndexMigrationFile,
      stockReceiptActivationMigrationFile,
      inventoryMutationHardeningMigrationFile,
      stockMovementIdentityValidationMigrationFile,
      memberInviteAuthorityMigrationFile,
      bpjsPolicyAuthorizationMigrationFile,
      posAuthoritativePricingMigrationFile,
      financialDocumentCommandOnlyMigrationFile,
      inventoryDocumentCommandOnlyMigrationFile,
      sensitiveReadBoundariesMigrationFile,
      loginSessionBindingMigrationFile,
      documentSequenceAuthorityMigrationFile,
      "20261125034613_canonical_industry_templates.sql",
      "20261125042012_employee_bpjs_participation.sql",
      "20261125044421_employee_photo_and_compensation.sql",
      "20261125050031_payroll_calculation_authority.sql",
      "20261125065030_company_reporting.sql",
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

  it("keeps legacy industry aliases while introducing canonical templates", () => {
    const migration = readFileSync(
      join(migrationsDir, "20261125034613_canonical_industry_templates.sql"),
      "utf8",
    );

    expect(migration).toContain("where id not in ('umkm', 'general')");
    expect(migration).not.toContain("delete from public.industry_templates");
    expect(migration).toContain("'tpl-manufacturing', 'tpl-food-beverage-recipe'");
  });

  it("preserves current BPJS behavior for existing employee rows", () => {
    const migration = readFileSync(
      join(migrationsDir, "20261125042012_employee_bpjs_participation.sql"),
      "utf8",
    );

    expect(migration).toContain("bpjs_participation text not null default 'both'");
    expect(migration).toContain("check (bpjs_participation in ('none', 'health', 'employment', 'both'))");
    expect(migration).not.toContain("update public.employees");
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

  it("adds auth security event logging and counterparty tax ids", () => {
    const migration = readFileSync(
      join(migrationsDir, "20260705004700_auth_security_events_and_counterparty_tax_ids.sql"),
      "utf8",
    );

    expect(migration).toContain("create table if not exists public.auth_security_events");
    expect(migration).toContain("email_hash text");
    expect(migration).toContain("ip_hash text not null");
    expect(migration).toContain("auth_security_events_email_window_idx");
    expect(migration).toContain("alter table public.auth_security_events enable row level security");
    expect(migration).toContain("revoke all on public.auth_security_events from public, anon, authenticated");
    expect(migration).toContain("grant select, insert, update, delete on public.auth_security_events to service_role");
    expect(migration).toContain("alter table public.customers");
    expect(migration).toContain("add column if not exists tax_id text");
    expect(migration).toContain("alter table public.suppliers");
    expect(migration).toContain("suppliers_business_tax_id_idx");
  });

  it("contains the bounded forward-only Data API privilege contract", () => {
    const migration = normalizeSql(readFileSync(join(migrationsDir, aclMigrationFile), "utf8"));
    const allCurrentTableRevokes =
      migration.match(/revoke [^;]+ on all tables in schema public [^;]+;/g) ?? [];

    expect(migration).toContain("begin; set local lock_timeout = '5s';");
    expect(migration).toContain("set local statement_timeout = '30s';");
    expect(migration).toContain(
      "alter default privileges for role postgres in schema public revoke all privileges on tables from anon, authenticated, service_role;",
    );
    expect(migration).toContain(
      "alter default privileges for role postgres in schema public revoke all privileges on sequences from anon, authenticated, service_role;",
    );
    expect(migration).toContain(
      "alter default privileges for role postgres revoke execute on functions from public;",
    );
    expect(migration).toContain(
      "alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated, service_role;",
    );
    expect(migration).toContain(
      "revoke truncate, references, trigger, maintain on all tables in schema public from public, anon, authenticated;",
    );
    expect(allCurrentTableRevokes).toEqual([
      "revoke truncate, references, trigger, maintain on all tables in schema public from public, anon, authenticated;",
    ]);
    expect(migration).toContain(
      "revoke all privileges on table public.audit_logs, public.industry_templates, public.demo_user_accounts, public.demo_sandboxes, public.activity_events from public, anon, authenticated;",
    );
    expect(migration).toContain(
      "grant select on table public.audit_logs, public.industry_templates, public.demo_user_accounts, public.demo_sandboxes to authenticated;",
    );
    expect(migration).toContain(
      "grant select, insert on table public.activity_events to authenticated;",
    );
    expect(migration).not.toContain("alter default privileges for role supabase_admin");
    expect(migration).not.toContain(
      "revoke select on all tables in schema public from authenticated",
    );
    expect(migration).not.toMatch(
      /revoke (?:select|insert|update|delete)\b[^;]*on all tables in schema public[^;]*authenticated;/,
    );
    expect(migration).not.toMatch(
      /revoke[^;]+on all tables in schema public[^;]*service_role;/,
    );
    expect(migration).not.toContain(
      "revoke all privileges on all tables in schema public",
    );
    expect(migration).not.toContain(" cascade;");
    expect(migration).not.toMatch(
      /revoke all privileges on table\b[^;]+from[^;]*service_role;/,
    );
    expect(migration).not.toContain("app_private.");
    expect(migration.match(/\bgrant\b/g) ?? []).toHaveLength(2);
    expect(migration).toMatch(/commit;$/);
  });

  it("adds an actor-bound, atomic, and idempotent stock receipt command", () => {
    const migration = normalizeSql(
      [
        stockReceiptMigrationFile,
        stockReceiptActivationMigrationFile,
      ]
        .map((file) => readFileSync(join(migrationsDir, file), "utf8"))
        .join("\n"),
    );
    const indexMigration = normalizeSql(
      readFileSync(join(migrationsDir, stockReceiptIndexMigrationFile), "utf8"),
    );

    expect(migration).toContain("begin; set local lock_timeout = '5s';");
    expect(migration).toContain("set local statement_timeout = '30s';");
    expect(migration).toContain(
      "alter table public.stock_movements add column if not exists operation_key uuid;",
    );
    expect(indexMigration).toBe(
      "create unique index concurrently stock_movements_business_operation_key_uidx on public.stock_movements (business_id, operation_key) where operation_key is not null;",
    );
    expect(indexMigration).not.toContain("begin;");
    expect(indexMigration).not.toContain("if not exists");
    expect(migration).toContain(
      "stock receipt operation-key index is missing, invalid, or has the wrong definition",
    );
    expect(migration).toContain(
      "stock receipt operation identity columns are missing or have an incompatible definition",
    );
    expect(migration).toContain(
      "stock receipt operation identity constraint is missing or has an incompatible definition",
    );
    expect(migration).toContain("index_record.indisvalid");
    expect(migration).toContain("index_record.indisready");
    expect(migration).toContain("index_record.indisunique");
    expect(migration).toContain(
      "stock receipt migrations must run as the postgres role",
    );
    expect(migration).toContain(
      "create or replace function app_private.protect_stock_movement_operation_key()",
    );
    expect(migration).toContain("language plpgsql security invoker set search_path = pg_catalog");
    expect(migration).toContain("current_user <> 'postgres'");
    expect(migration).toContain("app.stock_receipt_operation_key");
    expect(migration).toContain(
      "before insert or update or delete on public.stock_movements",
    );
    expect(migration).toContain("command-owned stock movements are immutable");
    expect(migration).toContain("command-owned stock movements cannot be deleted");
    expect(migration).toContain(
      "revoke all on function app_private.protect_stock_movement_operation_key() from public, anon, authenticated, service_role;",
    );
    expect(migration).toContain(
      "create or replace function app_private.lock_stock_movement_posting_window()",
    );
    expect(migration).toContain(
      "create trigger coordinate_stock_movement_posting_window before insert or update or delete on public.stock_movements",
    );
    expect(migration).toContain(
      "begin perform pg_advisory_xact_lock_shared( hashtextextended('posting-period-dml-global', 0) ); if tg_op = 'insert' then first_business_id := new.business_id;",
    );
    expect(migration).toContain(
      "if tg_op in ('update', 'delete') and public.is_period_locked(old.business_id, old.date)",
    );
    expect(migration).toContain(
      "create or replace function app_private.post_stock_receipt_internal(payload jsonb) returns jsonb language plpgsql security invoker set search_path = pg_catalog",
    );
    expect(migration).toContain(
      "app_private.member_has_permission( target_business_id, 'inventory:manage' )",
    );
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("posting-period-dml-global");
    expect(migration).toContain(
      "create or replace function app_private.lock_report_period_posting_window() returns trigger language plpgsql security invoker set search_path = pg_catalog as $$ declare first_business_id uuid; second_business_id uuid; begin if not pg_try_advisory_xact_lock( hashtextextended('posting-period-dml-global', 0) ) then raise exception 'posting activity is in flight. retry the period change.' using errcode = '55p03'; end if;",
    );
    expect(migration).toContain("hashtextextended");
    expect(migration).toContain("movement.operation_key = request_operation_key");
    expect(migration).toContain("'created', false, 'replayed', true");
    expect(migration).toContain(
      "idempotency key was already used for a different stock receipt",
    );
    expect(migration).toContain("product.is_purchasable = true");
    expect(migration).toContain("warehouse.is_active = true");
    expect(migration).toContain("public.is_period_locked(target_business_id, receipt_date)");
    expect(migration).toContain("insert into public.stock_movements");
    expect(migration).toContain("insert into public.activity_events");
    expect(migration).toContain("'stock receipt'");
    expect(migration).toContain(
      "revoke all on function app_private.post_stock_receipt_internal(jsonb) from public, anon, authenticated, service_role;",
    );
    expect(migration).toContain(
      "create or replace function public.post_stock_receipt(payload jsonb) returns jsonb language plpgsql security definer set search_path = pg_catalog",
    );
    expect(migration).toContain("app_private.apply_request_actor");
    expect(migration).toContain("payload - 'actoruserid'");
    expect(migration).toContain(
      "alter function public.post_stock_receipt(jsonb) owner to postgres;",
    );
    expect(migration).toContain(
      "revoke all on function public.post_stock_receipt(jsonb) from public, anon, authenticated, service_role;",
    );
    expect(migration).toContain(
      "grant execute on function public.post_stock_receipt(jsonb) to service_role;",
    );
    expect(migration).not.toContain(
      "grant execute on function public.post_stock_receipt(jsonb) to authenticated",
    );
    expect(migration).toMatch(/commit;$/);
  });

  it("hardens POS lock ordering and legacy stock movement updates forward-only", () => {
    const hardeningMigration = normalizeSql(
      readFileSync(
        join(migrationsDir, inventoryMutationHardeningMigrationFile),
        "utf8",
      ),
    );
    const validationMigration = normalizeSql(
      readFileSync(
        join(migrationsDir, stockMovementIdentityValidationMigrationFile),
        "utf8",
      ),
    );
    const helperCallIndex = hardeningMigration.indexOf(
      "app_private.lock_pos_sale_inventory_keys(trusted_payload)",
    );
    const legacyPostingCallIndex = hardeningMigration.indexOf(
      "public.post_pos_sale_internal(trusted_payload)",
    );

    expect(hardeningMigration).toContain(
      "begin; set local lock_timeout = '5s'; set local statement_timeout = '30s';",
    );
    expect(hardeningMigration).toContain(
      "inventory locking migrations must run as the postgres role",
    );
    expect(hardeningMigration).toContain(
      "create or replace function app_private.lock_pos_sale_inventory_keys(payload jsonb)",
    );
    expect(hardeningMigration).toContain(
      "parent_product.fulfillment_method = 'recipe_on_sale'",
    );
    expect(hardeningMigration).toContain(
      "join public.product_structure_lines structure_line",
    );
    expect(hardeningMigration).toContain("order by affected_item.item_id");
    expect(hardeningMigration).toContain(
      "'inventory-stock|' || target_business_id::text || '|' || affected_item_id::text || '|' || location_record.warehouse_id::text",
    );
    expect(hardeningMigration).toContain(
      "revoke all on function app_private.lock_pos_sale_inventory_keys(jsonb) from public, anon, authenticated, service_role;",
    );
    expect(helperCallIndex).toBeGreaterThanOrEqual(0);
    expect(legacyPostingCallIndex).toBeGreaterThan(helperCallIndex);
    expect(hardeningMigration).toContain(
      "revoke all on function public.post_pos_sale(jsonb) from public, anon, authenticated, service_role;",
    );
    expect(hardeningMigration).toContain(
      "grant execute on function public.post_pos_sale(jsonb) to service_role;",
    );
    expect(hardeningMigration).toContain(
      "revoke all on function public.post_pos_sale_internal(jsonb) from public, anon, authenticated, service_role;",
    );
    expect(hardeningMigration).toContain(
      "create or replace function public.ensure_stock_movement_consistency()",
    );
    expect(hardeningMigration).toContain(
      "values (old.business_id, old.item_id, old.warehouse_id), (new.business_id, new.item_id, new.warehouse_id)",
    );
    expect(hardeningMigration).toContain(
      "order by inventory_key.business_id, inventory_key.item_id, inventory_key.warehouse_id",
    );
    expect(hardeningMigration).toContain(
      "projected_quantity := available_quantity - old_quantity_effect + new_quantity_effect;",
    );
    expect(hardeningMigration).toContain(
      "projected_value := available_value - old_value_effect + new_value_effect;",
    );
    expect(hardeningMigration).toContain(
      "if projected_quantity < 0 and projected_quantity < available_quantity",
    );
    expect(hardeningMigration).toContain(
      "if projected_value < -0.5 and projected_value < available_value",
    );
    expect(hardeningMigration).not.toContain("drop function");
    expect(hardeningMigration).not.toContain("drop constraint");
    expect(hardeningMigration).toMatch(/commit;$/);

    expect(validationMigration).toContain(
      "alter table public.stock_movements validate constraint stock_movements_operation_identity_pair_chk;",
    );
    expect(validationMigration).toContain(
      "constraint_record.convalidated",
    );
    expect(validationMigration).not.toContain("drop constraint");
    expect(validationMigration).toMatch(/commit;$/);
  });

  it("enforces authoritative catalog pricing for every POS posting path", () => {
    const migration = normalizeSql(
      readFileSync(
        join(migrationsDir, posAuthoritativePricingMigrationFile),
        "utf8",
      ),
    );
    const rehearsal = normalizeSql(
      readFileSync(posAuthoritativePricingRehearsalFile, "utf8"),
    );
    const helperStart = migration.indexOf(
      "create or replace function app_private.lock_pos_sale_inventory_keys(payload jsonb)",
    );
    const v2Start = migration.indexOf(
      "create or replace function public.post_pos_sale_v2(payload jsonb)",
    );
    const internalStart = migration.indexOf(
      "create or replace function public.post_pos_sale_internal(payload jsonb)",
    );
    const helperBody = migration.slice(helperStart, v2Start);

    expect(migration).toContain(
      "begin; set local lock_timeout = '5s'; set local statement_timeout = '30s';",
    );
    expect(migration).toContain(
      "pos pricing migrations must run as the postgres role",
    );
    expect(helperStart).toBeGreaterThanOrEqual(0);
    expect(v2Start).toBeGreaterThan(helperStart);
    expect(internalStart).toBeGreaterThan(v2Start);
    expect(helperBody).not.toContain("line_item->>'unitprice'");
    expect(helperBody).toContain(
      "line_product_id is null or qty is null or qty <= 0",
    );
    expect(migration).toContain(
      "create or replace function public.post_pos_sale_v2(payload jsonb) returns uuid language plpgsql security definer set search_path = pg_catalog",
    );
    expect(migration).toContain(
      "revoke all on function public.post_pos_sale_v2(jsonb) from public, anon, authenticated, service_role;",
    );
    expect(migration).toContain(
      "grant execute on function public.post_pos_sale_v2(jsonb) to service_role;",
    );
    expect(migration).toContain(
      "create or replace function public.post_pos_sale_internal(payload jsonb) returns uuid language plpgsql security definer set search_path = pg_catalog",
    );
    expect(migration).toContain("for share of product");
    expect(migration).toContain("product.selling_price");
    expect(migration).toContain("if product_record.selling_price <= 0");
    expect(migration).toContain("unit_price := product_record.selling_price");
    expect(migration).toContain("resolved_items := resolved_items ||");
    expect(migration).toContain(
      "revoke all on function public.post_pos_sale_internal(jsonb) from public, anon, authenticated, service_role;",
    );
    expect(migration).toMatch(/commit;$/);

    expect(rehearsal).toContain("select plan(18)");
    expect(rehearsal).toContain("unitprice\":-100");
    expect(rehearsal).toContain("unitprice\":999999999");
    expect(rehearsal).toContain(
      "product pos price must be greater than zero",
    );
    expect(rehearsal).toContain("cross-tenant catalog product fails closed");
    expect(rehearsal).toMatch(/select \* from finish\(\); rollback;$/);
  });

  it("moves coupled financial documents behind actor-bound commands", () => {
    const migration = normalizeSql(
      readFileSync(
        join(migrationsDir, financialDocumentCommandOnlyMigrationFile),
        "utf8",
      ),
    );
    const rehearsal = normalizeSql(
      readFileSync(financialDocumentCommandOnlyRehearsalFile, "utf8"),
    );

    expect(migration).toContain(
      "begin; set local lock_timeout = '5s'; set local statement_timeout = '30s';",
    );
    expect(migration).toContain(
      "financial document command-only migrations must run as the postgres role",
    );
    expect(migration).toContain(
      "revoke all privileges on table public.branch_expenses, public.payments, public.payment_allocations, public.purchase_bills, public.purchase_bill_lines, public.sales_invoices, public.sales_invoice_lines, public.journal_entries, public.journal_lines from public, anon, authenticated;",
    );
    expect(migration).toContain(
      "grant select on table public.branch_expenses, public.payments, public.payment_allocations, public.purchase_bills, public.purchase_bill_lines, public.sales_invoices, public.sales_invoice_lines, public.journal_entries, public.journal_lines to authenticated;",
    );
    expect(migration).toContain("and policy.polcmd <> 'r'");

    for (const command of [
      "post_payment",
      "post_purchase_bill",
      "post_sales_invoice",
      "void_document",
    ]) {
      expect(migration).toContain(
        `create or replace function public.${command}(payload jsonb)`,
      );
      expect(migration).toContain(
        `revoke all on function public.${command}(jsonb) from public, anon, authenticated, service_role;`,
      );
      expect(migration).toContain(
        `grant execute on function public.${command}(jsonb) to service_role;`,
      );
      expect(migration).toContain(
        `revoke all on function public.${command}_internal(jsonb) from public, anon, authenticated, service_role;`,
      );
    }

    expect(migration).toContain(
      "app_private.member_has_permission(target_business_id, 'accounting:write')",
    );
    expect(migration).toContain(
      "create or replace function public.post_sales_invoice_internal(payload jsonb)",
    );
    expect(migration).toContain(
      "sum(invoice.total - invoice.paid_amount)",
    );
    expect(migration).toContain(
      "create or replace function public.post_payment_internal(payload jsonb)",
    );
    expect(migration).toContain(
      "select invoice.total, invoice.paid_amount into total_amount, paid_amount",
    );
    expect(migration).toContain(
      "paid_amount = invoice.paid_amount + payment_amount",
    );
    expect(migration).toContain(
      "revoke all on function public.post_branch_expense_internal(jsonb) from public, anon, authenticated, service_role;",
    );
    expect(migration).toContain(
      "revoke all on function public.create_posted_journal(uuid, date, text, text, uuid, text, jsonb) from public, anon, authenticated, service_role;",
    );
    expect(migration).toMatch(/commit;$/);

    expect(rehearsal).toContain("select plan(47)");
    expect(rehearsal).toContain(
      "authenticated cannot delete posted journal lines directly",
    );
    expect(rehearsal).toContain(
      "custom finance member cannot use accounting commands without effective permission",
    );
    expect(rehearsal).toContain(
      "an owner from another tenant cannot use accounting commands cross-tenant",
    );
    expect(rehearsal).toContain(
      "payment command keeps payment, allocation, and document balance consistent",
    );
    expect(rehearsal).toContain(
      "void preserves the original lines and creates a balanced reversal",
    );
    expect(rehearsal).toMatch(/select \* from finish\(\); rollback;$/);
  });

  it("moves inventory documents behind actor-bound commands and locked reversal", () => {
    const migration = normalizeSql(
      readFileSync(
        join(migrationsDir, inventoryDocumentCommandOnlyMigrationFile),
        "utf8",
      ),
    );
    const rehearsal = normalizeSql(
      readFileSync(inventoryDocumentCommandOnlyRehearsalFile, "utf8"),
    );
    const voidRoute = readFileSync(
      join(
        process.cwd(),
        "src",
        "app",
        "api",
        "erp",
        "documents",
        "void",
        "route.ts",
      ),
      "utf8",
    );

    expect(migration).toContain(
      "begin; set local lock_timeout = '5s'; set local statement_timeout = '30s';",
    );
    expect(migration).toContain(
      "inventory document command-only migrations must run as the postgres role",
    );
    expect(migration).toContain(
      "revoke all privileges on table public.stock_movements, public.stock_adjustments, public.stock_transfers from public, anon, authenticated;",
    );
    expect(migration).toContain(
      "grant select on table public.stock_movements, public.stock_adjustments, public.stock_transfers to authenticated;",
    );
    expect(migration).toContain("and policy.polcmd <> 'r'");
    expect(migration).toContain(
      "create or replace function app_private.member_has_warehouse_access( target_business_id uuid, target_warehouse_id uuid )",
    );
    expect(migration).toContain(
      "location.id = any(coalesce(member.location_ids, '{}'::uuid[]))",
    );
    expect(migration).toContain(
      "app_private.member_has_permission(target_business_id, 'inventory:manage')",
    );

    for (const command of [
      "post_stock_receipt",
      "post_stock_adjustment",
      "post_stock_transfer",
      "void_document",
    ]) {
      expect(migration).toContain(
        `create or replace function public.${command}(payload jsonb)`,
      );
      expect(migration).toContain(
        `revoke all on function public.${command}(jsonb) from public, anon, authenticated, service_role;`,
      );
      expect(migration).toContain(
        `grant execute on function public.${command}(jsonb) to service_role;`,
      );
    }

    expect(migration).toContain(
      "create or replace function app_private.void_inventory_document_internal(payload jsonb)",
    );
    expect(migration).toContain(
      "'inventory-void|' || target_business_id::text || '|' || target_document_type || '|' || target_document_id::text",
    );
    expect(migration).toContain(
      "inventory document is missing or already void",
    );
    expect(migration).toContain(
      "revoke all on function app_private.post_stock_receipt_internal(jsonb) from public, anon, authenticated, service_role;",
    );
    expect(migration).toContain(
      "revoke all on function public.post_stock_adjustment_internal(jsonb) from public, anon, authenticated, service_role;",
    );
    expect(migration).toContain(
      "revoke all on function public.post_stock_transfer_internal(jsonb) from public, anon, authenticated, service_role;",
    );
    expect(migration).toMatch(/commit;$/);

    expect(voidRoute).toContain("requireApiMembership(request)");
    expect(voidRoute).toContain('? "inventory:manage"');
    expect(voidRoute).toContain(': "accounting:write"');

    expect(rehearsal).toContain("select plan(48)");
    expect(rehearsal).toContain(
      "authenticated cannot insert stock movements directly",
    );
    expect(rehearsal).toContain(
      "custom inventory actor cannot adjust an unassigned warehouse",
    );
    expect(rehearsal).toContain(
      "transfer requires assignment to both warehouses",
    );
    expect(rehearsal).toContain(
      "stock receipt retry returns the existing result",
    );
    expect(rehearsal).toContain(
      "second adjustment reversal is rejected before duplicate effects",
    );
    expect(rehearsal).toContain(
      "second transfer reversal is rejected before duplicate effects",
    );
    expect(rehearsal).toMatch(/select \* from finish\(\); rollback;$/);
  });

  it("enforces permission-scoped sensitive reads, Storage capabilities, and actor-bound reconciliation", () => {
    const migration = normalizeSql(
      readFileSync(join(migrationsDir, sensitiveReadBoundariesMigrationFile), "utf8"),
    );
    const rehearsal = normalizeSql(
      readFileSync(sensitiveReadBoundariesRehearsalFile, "utf8"),
    );

    expect(migration).toContain(
      "create or replace function app_private.member_has_any_permission",
    );
    expect(migration).toContain(
      "create policy \"payroll members can read payroll runs\"",
    );
    expect(migration).toContain(
      "create policy \"assigned pos members can read branch expenses\"",
    );
    expect(migration).toContain(
      "app_private.redact_audit_snapshot(tg_table_name, to_jsonb(new))",
    );
    expect(migration).toContain(
      "drop policy if exists \"members can read erp attachment objects\" on storage.objects",
    );
    expect(migration).toContain(
      "grant execute on function public.reconciliation_rollup( uuid, uuid, uuid, text, date, date, integer ) to service_role",
    );
    expect(migration).toMatch(/commit;$/);

    expect(rehearsal).toContain("select plan(39)");
    expect(rehearsal).toContain(
      "pos reader cannot enumerate attachment metadata",
    );
    expect(rehearsal).toContain(
      "accounting reader cannot retrieve payroll audit records",
    );
    expect(rehearsal).toContain(
      "inventory member sees only assigned production orders",
    );
    expect(rehearsal).toContain(
      "service reconciliation rejects an unassigned location",
    );
    expect(rehearsal).toMatch(/select \* from finish\(\); rollback;$/);
  });

  it("binds application sessions to verified Supabase sessions and closes direct access", () => {
    const migration = normalizeSql(
      readFileSync(join(migrationsDir, loginSessionBindingMigrationFile), "utf8"),
    );
    const rehearsal = normalizeSql(
      readFileSync(loginSessionBindingRehearsalFile, "utf8"),
    );

    expect(migration).toContain(
      "alter table public.user_login_sessions add column if not exists supabase_session_id uuid",
    );
    expect(migration).toContain(
      "where supabase_session_id is null and status = 'active'",
    );
    expect(migration).toContain(
      "alter column supabase_session_id set not null",
    );
    expect(migration).toContain(
      "create unique index if not exists user_login_sessions_supabase_session_uidx",
    );
    expect(migration).toContain(
      "revoke all privileges on table public.user_login_sessions from public, anon, authenticated",
    );
    expect(migration).toMatch(/commit;$/);

    expect(rehearsal).toContain("select plan(13)");
    expect(rehearsal).toContain(
      "authenticated clients cannot read or mutate the session registry directly",
    );
    expect(rehearsal).toContain(
      "a supabase session cannot mint a second application session",
    );
    expect(rehearsal).toMatch(/select \* from finish\(\); rollback;$/);
  });

  it("makes document sequence state service-only while preserving atomic allocation", () => {
    const migration = normalizeSql(
      readFileSync(join(migrationsDir, documentSequenceAuthorityMigrationFile), "utf8"),
    );
    const rehearsal = normalizeSql(
      readFileSync(documentSequenceAuthorityRehearsalFile, "utf8"),
    );

    expect(migration).toContain(
      "revoke all privileges on table public.document_sequences from public, anon, authenticated",
    );
    expect(migration).toContain(
      "create or replace function public.next_document_no( target_business_id uuid, document_prefix text )",
    );
    expect(migration).toContain("set search_path = pg_catalog");
    expect(migration).toContain(
      "insert into public.document_sequences as sequence_state",
    );
    expect(migration).toContain(
      "on conflict (business_id, sequence_key) do update set next_value = sequence_state.next_value + 1 returning next_value - 1 into current_value",
    );
    expect(migration).toContain(
      "revoke all on function public.next_document_no(uuid, text) from public, anon, authenticated, service_role",
    );
    expect(migration).toMatch(/commit;$/);

    expect(rehearsal).toContain("select plan(20)");
    expect(rehearsal).toContain(
      "authenticated cannot reset sequence state",
    );
    expect(rehearsal).toContain(
      "a burst of allocations produces no duplicate number",
    );
    expect(rehearsal).toContain(
      "the allocator advances monotonically without a lost update",
    );
    expect(rehearsal).toMatch(/select \* from finish\(\); rollback;$/);
  });

  it("ships a transactional inventory mutation rehearsal contract", () => {
    const rehearsal = normalizeSql(
      readFileSync(inventoryMutationRehearsalFile, "utf8"),
    );

    expect(rehearsal).toContain(
      "begin; create extension if not exists pgtap with schema extensions; select plan(12);",
    );
    expect(rehearsal).toContain(
      "app_private.lock_pos_sale_inventory_keys(jsonb)",
    );
    expect(rehearsal).toContain(
      "public.ensure_stock_movement_consistency()",
    );
    expect(rehearsal).toContain(
      "an update cannot increase an outgoing movement beyond available quantity",
    );
    expect(rehearsal).toContain(
      "an update cannot increase an outgoing movement beyond available stock value",
    );
    expect(rehearsal).toContain(
      "moving an inbound row cannot leave its old inventory key negative",
    );
    expect(rehearsal).toMatch(/select \* from finish\(\); rollback;$/);
  });

  it("hardens member invites with bounded authority and atomic acceptance", () => {
    const migration = normalizeSql(
      readFileSync(join(migrationsDir, memberInviteAuthorityMigrationFile), "utf8"),
    );

    expect(migration).toContain(
      "create or replace function app_private.member_invite_assignment_allowed_for_actor",
    );
    expect(migration).toContain(
      "create or replace function app_private.protect_member_invite_update()",
    );
    expect(migration).toContain(
      "create or replace function public.accept_pending_member_invites_for_user(payload jsonb)",
    );
    expect(migration).toContain(
      "for key share; if not found or not app_private.member_has_permission_for_actor",
    );
    expect(migration).toContain(
      "invite_record.invited_by = target_user_id",
    );
    expect(migration).toContain(
      "on conflict (business_id, auth_user_id) do update set",
    );
    expect(migration).toContain(
      "revoke all on function public.accept_member_invite(uuid) from public, anon, authenticated, service_role;",
    );
    expect(migration).toContain(
      "grant execute on function public.accept_pending_member_invites_for_user(jsonb) to service_role;",
    );
    expect(migration).toContain(
      "revoke delete, truncate, references, trigger on table public.member_invites from authenticated;",
    );
    expect(migration).toMatch(/commit;$/);
  });

  it("ships a transactional member-invite authority rehearsal contract", () => {
    const rehearsal = normalizeSql(
      readFileSync(memberInviteAuthorityRehearsalFile, "utf8"),
    );

    expect(rehearsal).toContain(
      "begin; create extension if not exists pgtap with schema extensions; select plan(26);",
    );
    expect(rehearsal).toContain(
      "a default finance administrator cannot create a self-promoting owner invite",
    );
    expect(rehearsal).toContain(
      "acceptance fails after the inviter loses user-management authority",
    );
    expect(rehearsal).toContain(
      "legitimate acceptance creates exactly one membership",
    );
    expect(rehearsal).toContain(
      "replaying acceptance does not accept the same invite twice",
    );
    expect(rehearsal).toContain(
      "direct authenticated dml cannot mark an invite accepted",
    );
    expect(rehearsal).toMatch(/select \* from finish\(\); rollback;$/);
  });

  it("hardens BPJS reads and moves writes behind an actor-bound command", () => {
    const migration = normalizeSql(
      readFileSync(join(migrationsDir, bpjsPolicyAuthorizationMigrationFile), "utf8"),
    );

    expect(migration).toContain(
      "create policy \"payroll operators can read bpjs policies\" on public.bpjs_policies for select to authenticated",
    );
    expect(migration).toContain(
      "app_private.member_has_permission(business_id, 'payroll:run')",
    );
    expect(migration).toContain(
      "revoke all privileges on table public.bpjs_policies from public, anon, authenticated; grant select on table public.bpjs_policies to authenticated;",
    );
    expect(migration).toContain(
      "create or replace function app_private.upsert_bpjs_policy_internal(payload jsonb)",
    );
    expect(migration).toContain(
      "if not app_private.member_has_permission( target_business_id, 'hr:manage' )",
    );
    expect(migration).toContain(
      "create or replace function public.upsert_bpjs_policy(payload jsonb)",
    );
    expect(migration).toContain(
      "perform app_private.apply_request_actor( nullif(payload->>'actoruserid', '')::uuid );",
    );
    expect(migration).toContain(
      "grant execute on function public.upsert_bpjs_policy(jsonb) to service_role;",
    );
    expect(migration).toMatch(/commit;$/);
  });

  it("ships a transactional BPJS authorization rehearsal contract", () => {
    const rehearsal = normalizeSql(
      readFileSync(bpjsPolicyAuthorizationRehearsalFile, "utf8"),
    );

    expect(rehearsal).toContain(
      "begin; create extension if not exists pgtap with schema extensions; select plan(31);",
    );
    expect(rehearsal).toContain(
      "finance administrator sees no bpjs rows",
    );
    expect(rehearsal).toContain(
      "custom payroll operator cannot read another tenant bpjs row",
    );
    expect(rehearsal).toContain(
      "authenticated users cannot delete bpjs policies directly",
    );
    expect(rehearsal).toContain(
      "hr management permission cannot cross tenant boundaries",
    );
    expect(rehearsal).toContain(
      "custom hr manager can update bpjs policy through the command",
    );
    expect(rehearsal).toContain(
      "the authorized bpjs change records the real actor in the audit trail",
    );
    expect(rehearsal).toMatch(/select \* from finish\(\); rollback;$/);
  });

  it("ships a transactional PostgreSQL 17 ACL rehearsal contract", () => {
    const rehearsal = normalizeSql(readFileSync(aclRehearsalFile, "utf8"));

    expect(rehearsal).toContain(
      "begin; create extension if not exists pgtap with schema extensions; select plan(16);",
    );
    expect(rehearsal).toContain("current_user::text, 'postgres'");
    expect(rehearsal).toContain("has_table_privilege");
    expect(rehearsal).toContain("has_sequence_privilege");
    expect(rehearsal).toContain("has_function_privilege");
    expect(rehearsal).toContain("aclexplode");
    expect(rehearsal).toContain("service_role");
    expect(rehearsal).toContain("public.acl_default_table_probe_20260719");
    expect(rehearsal).toContain("public.acl_default_sequence_probe_20260719");
    expect(rehearsal).toContain("public.acl_default_function_probe_20260719()");

    for (const privilege of [
      "truncate",
      "references",
      "trigger",
      "maintain",
    ]) {
      expect(rehearsal).toContain(`'${privilege}'`);
    }

    expect(rehearsal).toMatch(/select \* from finish\(\); rollback;$/);
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

  it("keeps the stock receipt route command-only", () => {
    const route = readFileSync(
      join(process.cwd(), "src", "app", "api", "erp", "stock-receipts", "route.ts"),
      "utf8",
    );

    expect(route).toMatch(/callActorServiceRpc\(\s*"post_stock_receipt"/);
    expect(route).toContain('request.headers.get("idempotency-key")');
    expect(route).not.toContain('.from("products")');
    expect(route).not.toContain('.from("warehouses")');
    expect(route).not.toContain('.from("stock_movements")');
    expect(route).not.toContain('.from("activity_events")');
    expect(route).not.toContain("loadSupabaseWorkspace");
  });
});
