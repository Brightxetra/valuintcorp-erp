import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = join(process.cwd(), "supabase", "migrations");

describe("Supabase migration contract", () => {
  it("keeps production ERP migrations in order through 012", () => {
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
    expect(migration).toContain("grant execute on function public.post_sales_invoice(jsonb) to authenticated");
    expect(migration).toContain("revoke execute on function public.require_posting_role(uuid, text[]) from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.require_posting_role(uuid, text[]) to service_role");
    expect(migration).toContain("to_regprocedure('public.rls_auto_enable()')");
  });
});
