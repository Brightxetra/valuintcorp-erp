-- Reduce Supabase RLS performance lint noise without widening access.
-- Read policies stay SELECT-only; previous FOR ALL manage policies are split
-- so write access no longer creates a second permissive SELECT path.

drop policy if exists "any authenticated user can read industry templates" on public.industry_templates;
create policy "any authenticated user can read industry templates"
on public.industry_templates for select to authenticated
using ((select auth.uid()) is not null);

drop policy if exists "demo users can read own account" on public.demo_user_accounts;
create policy "demo users can read own account"
on public.demo_user_accounts for select to authenticated
using (
  (select auth.uid()) = auth_user_id
  or lower(email) = lower(coalesce(((select auth.jwt()) ->> 'email'), ''))
);

drop policy if exists "demo users can read own sandbox" on public.demo_sandboxes;
create policy "demo users can read own sandbox"
on public.demo_sandboxes for select to authenticated
using ((select auth.uid()) = auth_user_id or public.is_business_member(business_id));

do $$
declare
  policy_rule record;
begin
  for policy_rule in
    select * from (values
      ('attachments', 'members can read attachments', 'public.is_business_member(business_id)', 'members can manage attachments', 'public.has_business_role(business_id, array[''owner'', ''finance_admin'', ''staff'', ''hr'', ''system_admin''])'),
      ('business_feature_flags', 'members can read feature flags', 'public.is_business_member(business_id)', 'owners can manage feature flags', 'public.has_business_role(business_id, array[''owner'', ''finance_admin'', ''system_admin''])'),
      ('business_members', 'members can read memberships', 'public.is_business_member(business_id)', 'owners can manage memberships', 'public.has_business_role(business_id, array[''owner'', ''system_admin''])'),
      ('chart_of_accounts', 'members can read chart of accounts', 'public.is_business_member(business_id)', 'finance can manage chart of accounts', 'public.has_business_role(business_id, array[''owner'', ''finance_admin'', ''system_admin''])'),
      ('customers', 'members can read customers', 'public.is_business_member(business_id)', 'finance can manage customers', 'public.has_business_role(business_id, array[''owner'', ''finance_admin'', ''staff'', ''system_admin''])'),
      ('daily_transaction_summaries', 'members can read daily summaries', 'public.is_business_member(business_id)', 'finance can manage daily summaries', 'public.has_business_role(business_id, array[''owner'', ''finance_admin'', ''staff'', ''system_admin''])'),
      ('document_sequences', 'members can read document sequences', 'public.is_business_member(business_id)', 'system can manage document sequences', 'public.has_business_role(business_id, array[''owner'', ''finance_admin'', ''staff'', ''hr'', ''system_admin''])'),
      ('employees', 'hr and finance can read employees', 'public.has_business_role(business_id, array[''owner'', ''finance_admin'', ''hr'', ''system_admin''])', 'hr can manage employees', 'public.has_business_role(business_id, array[''owner'', ''hr'', ''system_admin''])'),
      ('fixed_asset_depreciation_lines', 'members can read depreciation lines', 'public.is_business_member(business_id)', 'finance can manage depreciation lines', 'public.has_business_role(business_id, array[''owner'', ''finance_admin'', ''system_admin''])'),
      ('fixed_asset_depreciation_runs', 'members can read depreciation runs', 'public.is_business_member(business_id)', 'finance can manage depreciation runs', 'public.has_business_role(business_id, array[''owner'', ''finance_admin'', ''system_admin''])'),
      ('fixed_asset_disposals', 'members can read fixed asset disposals', 'public.is_business_member(business_id)', 'finance can manage fixed asset disposals', 'public.has_business_role(business_id, array[''owner'', ''finance_admin'', ''system_admin''])'),
      ('fixed_assets', 'members can read fixed assets', 'public.is_business_member(business_id)', 'finance can manage fixed assets', 'public.has_business_role(business_id, array[''owner'', ''finance_admin'', ''system_admin''])'),
      ('import_batches', 'members can read imports', 'public.is_business_member(business_id)', 'finance can manage imports', 'public.has_business_role(business_id, array[''owner'', ''finance_admin'', ''system_admin''])'),
      ('inventory_items', 'members can read inventory items', 'public.is_business_member(business_id)', 'inventory roles can manage items', 'public.has_business_role(business_id, array[''owner'', ''finance_admin'', ''staff'', ''system_admin''])'),
      ('journal_entries', 'members can read journal entries', 'public.is_business_member(business_id)', 'finance can manage journal entries', 'public.has_business_role(business_id, array[''owner'', ''finance_admin'', ''system_admin''])'),
      ('journal_lines', 'members can read journal lines', 'public.is_business_member(business_id)', 'finance can manage journal lines', 'public.has_business_role(business_id, array[''owner'', ''finance_admin'', ''system_admin''])'),
      ('locations', 'members can read locations', 'public.is_business_member(business_id)', 'owners can manage locations', 'public.has_business_role(business_id, array[''owner'', ''finance_admin'', ''staff'', ''system_admin''])'),
      ('member_invites', 'admins can read member invites', 'public.has_business_role(business_id, array[''owner'', ''finance_admin'', ''system_admin''])', 'admins can manage member invites', 'public.has_business_role(business_id, array[''owner'', ''finance_admin'', ''system_admin''])'),
      ('payment_allocations', 'members can read payment allocations', 'public.is_business_member(business_id)', 'finance can manage payment allocations', 'public.has_business_role(business_id, array[''owner'', ''finance_admin'', ''system_admin''])'),
      ('payments', 'members can read payments', 'public.is_business_member(business_id)', 'finance can manage payments', 'public.has_business_role(business_id, array[''owner'', ''finance_admin'', ''system_admin''])'),
      ('payroll_runs', 'hr and finance can read payroll', 'public.has_business_role(business_id, array[''owner'', ''finance_admin'', ''hr'', ''system_admin''])', 'hr can manage payroll', 'public.has_business_role(business_id, array[''owner'', ''hr'', ''system_admin''])'),
      ('products', 'members can read products', 'public.is_business_member(business_id)', 'inventory can manage products', 'public.has_business_role(business_id, array[''owner'', ''finance_admin'', ''staff'', ''system_admin''])'),
      ('purchase_bill_lines', 'members can read purchase bill lines', 'public.is_business_member(business_id)', 'purchase roles can manage purchase bill lines', 'public.has_business_role(business_id, array[''owner'', ''finance_admin'', ''staff'', ''system_admin''])'),
      ('purchase_bills', 'members can read purchase bills', 'public.is_business_member(business_id)', 'purchase roles can manage purchase bills', 'public.has_business_role(business_id, array[''owner'', ''finance_admin'', ''staff'', ''system_admin''])'),
      ('raw_import_batches', 'members can read raw import batches', 'public.is_business_member(business_id)', 'finance can manage raw import batches', 'public.has_business_role(business_id, array[''owner'', ''finance_admin'', ''staff'', ''system_admin''])'),
      ('raw_payments', 'members can read raw payments', 'public.is_business_member(business_id)', 'finance can manage raw payments', 'public.has_business_role(business_id, array[''owner'', ''finance_admin'', ''staff'', ''system_admin''])'),
      ('raw_transaction_lines', 'members can read raw transaction lines', 'public.is_business_member(business_id)', 'finance can manage raw transaction lines', 'public.has_business_role(business_id, array[''owner'', ''finance_admin'', ''staff'', ''system_admin''])'),
      ('raw_transactions', 'members can read raw transactions', 'public.is_business_member(business_id)', 'finance can manage raw transactions', 'public.has_business_role(business_id, array[''owner'', ''finance_admin'', ''staff'', ''system_admin''])'),
      ('report_periods', 'members can read report periods', 'public.is_business_member(business_id)', 'finance can manage report periods', 'public.has_business_role(business_id, array[''owner'', ''finance_admin'', ''system_admin''])'),
      ('sales_invoice_lines', 'members can read sales invoice lines', 'public.is_business_member(business_id)', 'sales roles can manage sales invoice lines', 'public.has_business_role(business_id, array[''owner'', ''finance_admin'', ''staff'', ''system_admin''])'),
      ('sales_invoices', 'members can read sales invoices', 'public.is_business_member(business_id)', 'sales roles can manage sales invoices', 'public.has_business_role(business_id, array[''owner'', ''finance_admin'', ''staff'', ''system_admin''])'),
      ('settlement_records', 'members can read settlements', 'public.is_business_member(business_id)', 'finance can manage settlements', 'public.has_business_role(business_id, array[''owner'', ''finance_admin'', ''system_admin''])'),
      ('stock_adjustments', 'members can read stock adjustments', 'public.is_business_member(business_id)', 'inventory can manage stock adjustments', 'public.has_business_role(business_id, array[''owner'', ''finance_admin'', ''staff'', ''system_admin''])'),
      ('stock_movements', 'members can read stock movements', 'public.is_business_member(business_id)', 'inventory roles can manage stock movements', 'public.has_business_role(business_id, array[''owner'', ''finance_admin'', ''staff'', ''system_admin''])'),
      ('stock_opnames', 'members can read stock opnames', 'public.is_business_member(business_id)', 'inventory can manage stock opnames', 'public.has_business_role(business_id, array[''owner'', ''finance_admin'', ''staff'', ''system_admin''])'),
      ('stock_transfers', 'members can read stock transfers', 'public.is_business_member(business_id)', 'inventory can manage stock transfers', 'public.has_business_role(business_id, array[''owner'', ''finance_admin'', ''staff'', ''system_admin''])'),
      ('suppliers', 'members can read suppliers', 'public.is_business_member(business_id)', 'finance can manage suppliers', 'public.has_business_role(business_id, array[''owner'', ''finance_admin'', ''staff'', ''system_admin''])'),
      ('tax_profiles', 'finance can read tax profiles', 'public.has_business_role(business_id, array[''owner'', ''finance_admin'', ''external_advisor'', ''system_admin''])', 'finance can manage tax profiles', 'public.has_business_role(business_id, array[''owner'', ''finance_admin'', ''system_admin''])'),
      ('transaction_source_mappings', 'members can read transaction source mappings', 'public.is_business_member(business_id)', 'finance can manage transaction source mappings', 'public.has_business_role(business_id, array[''owner'', ''finance_admin'', ''system_admin''])'),
      ('transaction_sources', 'members can read transaction sources', 'public.is_business_member(business_id)', 'finance can manage transaction sources', 'public.has_business_role(business_id, array[''owner'', ''finance_admin'', ''system_admin''])'),
      ('transactions', 'members can read transactions', 'public.is_business_member(business_id)', 'accounting roles can manage transactions', 'public.has_business_role(business_id, array[''owner'', ''finance_admin'', ''staff'', ''system_admin''])'),
      ('warehouses', 'members can read inventory setup', 'public.is_business_member(business_id)', 'inventory roles can manage warehouses', 'public.has_business_role(business_id, array[''owner'', ''finance_admin'', ''staff'', ''system_admin''])')
    ) as policy_rules(table_name, read_policy, read_using, manage_policy, manage_using)
  loop
    execute format('drop policy if exists %I on public.%I', policy_rule.manage_policy, policy_rule.table_name);
    execute format('drop policy if exists %I on public.%I', policy_rule.manage_policy || ' insert', policy_rule.table_name);
    execute format('drop policy if exists %I on public.%I', policy_rule.manage_policy || ' update', policy_rule.table_name);
    execute format('drop policy if exists %I on public.%I', policy_rule.manage_policy || ' delete', policy_rule.table_name);
    execute format('drop policy if exists %I on public.%I', policy_rule.read_policy, policy_rule.table_name);

    execute format(
      'create policy %I on public.%I for select to authenticated using (%s)',
      policy_rule.read_policy,
      policy_rule.table_name,
      policy_rule.read_using
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (%s)',
      policy_rule.manage_policy || ' insert',
      policy_rule.table_name,
      policy_rule.manage_using
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (%s) with check (%s)',
      policy_rule.manage_policy || ' update',
      policy_rule.table_name,
      policy_rule.manage_using,
      policy_rule.manage_using
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (%s)',
      policy_rule.manage_policy || ' delete',
      policy_rule.table_name,
      policy_rule.manage_using
    );
  end loop;
end;
$$;
