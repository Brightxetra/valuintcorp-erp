create table if not exists public.demo_user_accounts (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  email text not null,
  role text not null default 'owner' check (role in ('owner', 'finance_admin', 'staff', 'hr', 'external_advisor', 'system_admin')),
  template_id text not null default 'food_beverage',
  display_name text not null default 'Valuintcorp Demo',
  enabled boolean not null default true,
  reset_policy text not null default 'daily' check (reset_policy in ('daily', 'manual', 'none')),
  seed_version integer not null default 1 check (seed_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists demo_user_accounts_email_idx
  on public.demo_user_accounts (lower(email));

create index if not exists demo_user_accounts_enabled_idx
  on public.demo_user_accounts (enabled, lower(email));

create table if not exists public.demo_sandboxes (
  id uuid primary key default gen_random_uuid(),
  demo_user_account_id uuid not null references public.demo_user_accounts(id) on delete cascade,
  auth_user_id uuid not null unique,
  business_id uuid not null unique references public.businesses(id) on delete cascade,
  template_id text not null default 'food_beverage',
  reset_policy text not null default 'daily' check (reset_policy in ('daily', 'manual', 'none')),
  seed_version integer not null default 1 check (seed_version > 0),
  last_reset_at timestamptz,
  next_reset_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists demo_sandboxes_next_reset_idx
  on public.demo_sandboxes (reset_policy, next_reset_at)
  where reset_policy = 'daily';

alter table public.demo_user_accounts enable row level security;
alter table public.demo_sandboxes enable row level security;

drop policy if exists "demo users can read own account" on public.demo_user_accounts;
create policy "demo users can read own account" on public.demo_user_accounts for select
using (auth.uid() = auth_user_id or lower(email) = lower(coalesce(auth.jwt()->>'email', '')));

drop policy if exists "demo users can read own sandbox" on public.demo_sandboxes;
create policy "demo users can read own sandbox" on public.demo_sandboxes for select
using (auth.uid() = auth_user_id or public.is_business_member(business_id));

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'demo_user_accounts',
    'demo_sandboxes'
  ]
  loop
    execute format('drop trigger if exists touch_%I_updated_at on public.%I', table_name, table_name);
    execute format(
      'create trigger touch_%I_updated_at before update on public.%I for each row execute function public.touch_updated_at()',
      table_name,
      table_name
    );
  end loop;
end $$;

create or replace function public.require_demo_sandbox(target_business_id uuid)
returns public.demo_sandboxes
language plpgsql
security definer
set search_path = public
as $$
declare
  sandbox_record public.demo_sandboxes;
begin
  select * into sandbox_record
  from public.demo_sandboxes
  where business_id = target_business_id;

  if sandbox_record.id is null then
    raise exception 'Business % is not a demo sandbox.', target_business_id;
  end if;

  return sandbox_record;
end;
$$;

create or replace function public.seed_demo_sandbox_business(
  target_business_id uuid,
  target_auth_user_id uuid,
  target_email text,
  target_role text default 'owner',
  target_template_id text default 'food_beverage'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_period_start date := date_trunc('month', current_date)::date;
  current_period_end date := (date_trunc('month', current_date) + interval '1 month - 1 day')::date;
  primary_warehouse_id uuid;
  booth_warehouse_id uuid;
  primary_location_id uuid;
  booth_location_id uuid;
  account_cash uuid;
  account_ar uuid;
  account_inventory uuid;
  account_capital uuid;
  account_sales uuid;
  account_service uuid;
  account_cogs uuid;
  account_payroll uuid;
  customer_event_id uuid;
  customer_walkin_id uuid;
  supplier_bumbu_id uuid;
  supplier_packaging_id uuid;
  product_food_id uuid;
  product_drink_id uuid;
  product_service_id uuid;
  employee_one_id uuid;
  opening_journal_id uuid;
  sales_journal_id uuid;
  raw_batch_id uuid;
  raw_tx_one_id uuid;
  raw_tx_two_id uuid;
  enabled_module text;
begin
  perform public.require_demo_sandbox(target_business_id);

  delete from public.attachments where business_id = target_business_id;
  delete from public.payment_allocations where business_id = target_business_id;
  delete from public.payments where business_id = target_business_id;
  delete from public.stock_movements where business_id = target_business_id;
  delete from public.stock_transfers where business_id = target_business_id;
  delete from public.stock_adjustments where business_id = target_business_id;
  delete from public.stock_opnames where business_id = target_business_id;
  delete from public.payroll_runs where business_id = target_business_id;
  delete from public.leave_requests where business_id = target_business_id;
  delete from public.attendance where business_id = target_business_id;
  delete from public.employees where business_id = target_business_id;
  delete from public.sales_invoice_lines where business_id = target_business_id;
  delete from public.sales_invoices where business_id = target_business_id;
  delete from public.purchase_bill_lines where business_id = target_business_id;
  delete from public.purchase_bills where business_id = target_business_id;
  delete from public.raw_payments where business_id = target_business_id;
  delete from public.raw_transaction_lines where business_id = target_business_id;
  delete from public.raw_transactions where business_id = target_business_id;
  delete from public.raw_import_batches where business_id = target_business_id;
  delete from public.settlement_records where business_id = target_business_id;
  delete from public.daily_transaction_summaries where business_id = target_business_id;
  delete from public.import_batches where business_id = target_business_id;
  delete from public.transaction_source_mappings where business_id = target_business_id;
  delete from public.transaction_sources where business_id = target_business_id;
  delete from public.business_feature_flags where business_id = target_business_id;
  delete from public.locations where business_id = target_business_id;
  delete from public.products where business_id = target_business_id;
  delete from public.suppliers where business_id = target_business_id;
  delete from public.customers where business_id = target_business_id;
  delete from public.activity_events where business_id = target_business_id;
  delete from public.journal_lines where business_id = target_business_id;
  delete from public.journal_entries where business_id = target_business_id;
  delete from public.transactions where business_id = target_business_id;
  delete from public.document_sequences where business_id = target_business_id;
  delete from public.member_invites where business_id = target_business_id;
  delete from public.business_members where business_id = target_business_id;
  delete from public.tax_profiles where business_id = target_business_id;
  delete from public.report_periods where business_id = target_business_id;
  delete from public.warehouses where business_id = target_business_id;
  delete from public.chart_of_accounts where business_id = target_business_id;
  delete from public.audit_logs where business_id = target_business_id;

  update public.businesses
  set
    legal_name = 'PT Demo Valuintcorp',
    display_name = 'Demo Sandbox',
    industry = case when target_template_id = 'distributor' then 'retail' else target_template_id end,
    tax_id = '09.999.999.9-999.000',
    owner_name = coalesce(nullif(target_email, ''), 'Demo Owner')
  where id = target_business_id;

  insert into public.business_members (business_id, auth_user_id, role)
  values (target_business_id, target_auth_user_id, target_role);

  insert into public.chart_of_accounts (business_id, code, name, type, normal_balance, category, is_system, is_active)
  values
    (target_business_id, '1000', 'Kas dan Bank', 'asset', 'debit', 'cash', true, true),
    (target_business_id, '1100', 'Piutang Usaha', 'asset', 'debit', 'receivable', true, true),
    (target_business_id, '1200', 'Persediaan', 'asset', 'debit', 'inventory', true, true),
    (target_business_id, '1300', 'Aset Tetap', 'asset', 'debit', 'fixed_asset', true, true),
    (target_business_id, '2000', 'Utang Usaha', 'liability', 'credit', 'payable', true, true),
    (target_business_id, '2100', 'Utang Gaji', 'liability', 'credit', 'payable', true, true),
    (target_business_id, '2200', 'Utang Pajak', 'liability', 'credit', 'tax', true, true),
    (target_business_id, '3000', 'Modal Pemilik', 'equity', 'credit', 'capital', true, true),
    (target_business_id, '3100', 'Prive Pemilik', 'equity', 'credit', 'capital', true, true),
    (target_business_id, '4000', 'Pendapatan Penjualan', 'revenue', 'credit', 'sales', true, true),
    (target_business_id, '4010', 'Pendapatan Jasa', 'revenue', 'credit', 'sales', true, true),
    (target_business_id, '5000', 'Harga Pokok Penjualan', 'expense', 'debit', 'cogs', true, true),
    (target_business_id, '5100', 'Beban Operasional', 'expense', 'debit', 'operating_expense', true, true),
    (target_business_id, '5200', 'Beban Gaji', 'expense', 'debit', 'payroll', true, true),
    (target_business_id, '5300', 'Beban Pajak', 'expense', 'debit', 'tax', true, true),
    (target_business_id, '6000', 'Penyesuaian Persediaan', 'expense', 'debit', 'adjustment', true, true);

  select id into account_cash from public.chart_of_accounts where business_id = target_business_id and code = '1000';
  select id into account_ar from public.chart_of_accounts where business_id = target_business_id and code = '1100';
  select id into account_inventory from public.chart_of_accounts where business_id = target_business_id and code = '1200';
  select id into account_capital from public.chart_of_accounts where business_id = target_business_id and code = '3000';
  select id into account_sales from public.chart_of_accounts where business_id = target_business_id and code = '4000';
  select id into account_service from public.chart_of_accounts where business_id = target_business_id and code = '4010';
  select id into account_cogs from public.chart_of_accounts where business_id = target_business_id and code = '5000';
  select id into account_payroll from public.chart_of_accounts where business_id = target_business_id and code = '5200';

  insert into public.report_periods (business_id, label, start_date, end_date, locked)
  values (target_business_id, to_char(current_period_start, 'YYYY-MM'), current_period_start, current_period_end, false);

  insert into public.tax_profiles (business_id, taxpayer_type, uses_final_umkm_rate, final_umkm_rate, coretax_status)
  values (target_business_id, 'individual_umkm', true, 0.005, 'not_started');

  insert into public.warehouses (business_id, code, name, location, is_active)
  values (target_business_id, 'KITCHEN', 'Dapur Utama', 'Outlet utama', true)
  returning id into primary_warehouse_id;

  insert into public.warehouses (business_id, code, name, location, is_active)
  values (target_business_id, 'BOOTH', 'Booth Event', 'Event dan bazaar', true)
  returning id into booth_warehouse_id;

  insert into public.locations (business_id, code, name, type, warehouse_id, is_active)
  values (target_business_id, 'LOC-001', 'Outlet Utama', 'outlet', primary_warehouse_id, true)
  returning id into primary_location_id;

  insert into public.locations (business_id, code, name, type, warehouse_id, is_active)
  values (target_business_id, 'LOC-002', 'Booth Event', 'outlet', booth_warehouse_id, true)
  returning id into booth_location_id;

  if exists (select 1 from public.industry_templates where id = target_template_id) then
    for enabled_module in
      select unnest(enabled_modules) from public.industry_templates where id = target_template_id
    loop
      insert into public.business_feature_flags (business_id, module, enabled)
      values (target_business_id, enabled_module, true)
      on conflict (business_id, module) do update set enabled = true;
    end loop;
  else
    foreach enabled_module in array array['dashboard', 'sales', 'purchases', 'inventory', 'accounting', 'reports', 'hr', 'payroll', 'tax', 'imports', 'locations']
    loop
      insert into public.business_feature_flags (business_id, module, enabled)
      values (target_business_id, enabled_module, true)
      on conflict (business_id, module) do update set enabled = true;
    end loop;
  end if;

  insert into public.transaction_sources (business_id, location_id, source_type, name, is_active)
  values
    (target_business_id, primary_location_id, 'manual', 'Input Manual', true),
    (target_business_id, primary_location_id, 'pos_csv', 'POS CSV Outlet', true),
    (target_business_id, booth_location_id, 'marketplace_csv', 'Marketplace CSV', true);

  insert into public.customers (business_id, code, name, phone, email, address, credit_limit, is_active)
  values
    (target_business_id, 'CUST-001', 'PT Event Ceria', '0812-0000-0001', 'finance@eventceria.test', 'Jakarta', 10000000, true),
    (target_business_id, 'CUST-002', 'Booth Walk-in', null, null, 'Walk-in customer', 0, true);
  select id into customer_event_id from public.customers where business_id = target_business_id and code = 'CUST-001';
  select id into customer_walkin_id from public.customers where business_id = target_business_id and code = 'CUST-002';

  insert into public.suppliers (business_id, code, name, phone, email, address, is_active)
  values
    (target_business_id, 'SUP-001', 'CV Bumbu Nusantara', '021-555-0101', 'sales@bumbunusantara.test', 'Bekasi', true),
    (target_business_id, 'SUP-002', 'Toko Kemasan Maju', '021-555-0102', null, 'Tangerang', true);
  select id into supplier_bumbu_id from public.suppliers where business_id = target_business_id and code = 'SUP-001';
  select id into supplier_packaging_id from public.suppliers where business_id = target_business_id and code = 'SUP-002';

  insert into public.products (
    business_id,
    sku,
    name,
    variant,
    category,
    unit,
    product_type,
    track_stock,
    default_warehouse_id,
    selling_price,
    purchase_price,
    reorder_point,
    is_sellable,
    is_purchasable,
    is_active
  )
  values
    (target_business_id, 'FNB-RND-250', 'Rendang Bowl', '250g', 'Makanan', 'porsi', 'stock_item', true, primary_warehouse_id, 50000, 25000, 5, true, true, true),
    (target_business_id, 'DRK-TEH-350', 'Es Teh Nusantara', '350ml', 'Minuman', 'gelas', 'stock_item', true, primary_warehouse_id, 18000, 6500, 10, true, true, true),
    (target_business_id, 'SVC-CATERING', 'Jasa Catering Event', null, 'Jasa', 'paket', 'service', false, null, 2500000, 0, 0, true, false, true);
  select id into product_food_id from public.products where business_id = target_business_id and sku = 'FNB-RND-250';
  select id into product_drink_id from public.products where business_id = target_business_id and sku = 'DRK-TEH-350';
  select id into product_service_id from public.products where business_id = target_business_id and sku = 'SVC-CATERING';

  insert into public.stock_movements (business_id, item_id, warehouse_id, date, type, quantity, value, memo)
  values
    (target_business_id, product_food_id, primary_warehouse_id, current_date - 2, 'purchase', 40, 1000000, 'Seed stok awal demo'),
    (target_business_id, product_drink_id, primary_warehouse_id, current_date - 2, 'purchase', 80, 520000, 'Seed stok awal demo'),
    (target_business_id, product_food_id, primary_warehouse_id, current_date - 1, 'sale', 8, 200000, 'Seed penjualan demo'),
    (target_business_id, product_drink_id, primary_warehouse_id, current_date - 1, 'sale', 12, 78000, 'Seed penjualan demo');

  insert into public.employees (business_id, employee_no, name, role, contract_type, status, base_salary, daily_rate, joined_at)
  values
    (target_business_id, 'EMP-001', 'Dimas Pratama', 'Head Kitchen', 'permanent', 'active', 4500000, null, current_date - 120),
    (target_business_id, 'EMP-002', 'Naya Putri', 'Crew Outlet', 'daily', 'active', 0, 150000, current_date - 45);
  select id into employee_one_id from public.employees where business_id = target_business_id and employee_no = 'EMP-001';

  insert into public.attendance (business_id, employee_id, date, status, hours)
  values
    (target_business_id, employee_one_id, current_date - 1, 'present', 8),
    (target_business_id, employee_one_id, current_date, 'present', 8);

  insert into public.payroll_runs (business_id, period, employee_id, gross_pay, deductions, tax_withheld, net_pay, components, created_at)
  values (
    target_business_id,
    to_char(current_period_start, 'YYYY-MM'),
    employee_one_id,
    4500000,
    150000,
    50000,
    4300000,
    '[{"name":"Gaji Pokok","amount":4500000},{"name":"BPJS","amount":-150000},{"name":"PPh21","amount":-50000}]'::jsonb,
    now()
  );

  insert into public.journal_entries (business_id, date, period, description, source, status, created_by, created_by_role)
  values (target_business_id, current_date - 2, to_char(current_period_start, 'YYYY-MM'), 'Saldo awal demo sandbox', 'opening_balance', 'posted', target_auth_user_id, target_role)
  returning id into opening_journal_id;

  insert into public.journal_lines (business_id, journal_entry_id, account_id, debit, credit, memo)
  values
    (target_business_id, opening_journal_id, account_cash, 15000000, 0, 'Kas awal'),
    (target_business_id, opening_journal_id, account_inventory, 1520000, 0, 'Persediaan awal'),
    (target_business_id, opening_journal_id, account_capital, 0, 16520000, 'Modal awal');

  insert into public.sales_invoices (business_id, invoice_no, customer_id, date, due_date, status, total, paid_amount, created_by)
  values (target_business_id, 'INV-DEMO-0001', customer_event_id, current_date - 1, current_date + 13, 'posted', 2500000, 0, target_auth_user_id);

  insert into public.purchase_bills (business_id, bill_no, supplier_id, date, due_date, status, total, paid_amount, created_by)
  values (target_business_id, 'BILL-DEMO-0001', supplier_bumbu_id, current_date - 2, current_date + 12, 'posted', 1000000, 0, target_auth_user_id);

  insert into public.journal_entries (business_id, date, period, description, source, status, created_by, created_by_role)
  values (target_business_id, current_date - 1, to_char(current_period_start, 'YYYY-MM'), 'Penjualan harian demo outlet', 'csv_import', 'posted', target_auth_user_id, target_role)
  returning id into sales_journal_id;

  insert into public.journal_lines (business_id, journal_entry_id, account_id, debit, credit, memo)
  values
    (target_business_id, sales_journal_id, account_cash, 1296000, 0, 'Penjualan QRIS dan kas'),
    (target_business_id, sales_journal_id, account_ar, 2500000, 0, 'Invoice event'),
    (target_business_id, sales_journal_id, account_cogs, 278000, 0, 'HPP makanan/minuman'),
    (target_business_id, sales_journal_id, account_sales, 0, 1296000, 'Pendapatan outlet'),
    (target_business_id, sales_journal_id, account_service, 0, 2500000, 'Pendapatan catering'),
    (target_business_id, sales_journal_id, account_inventory, 0, 278000, 'Persediaan keluar');

  insert into public.raw_import_batches (business_id, location_id, source, status, total_rows, valid_rows, duplicate_rows, error_rows)
  values (target_business_id, primary_location_id, 'pos_csv', 'summarized', 2, 2, 0, 0)
  returning id into raw_batch_id;

  insert into public.raw_transactions (
    business_id,
    location_id,
    batch_id,
    source,
    external_id,
    idempotency_key,
    transaction_date,
    status,
    gross_amount,
    discount_amount,
    net_amount,
    tax_amount,
    payment_method,
    customer_name
  )
  values
    (target_business_id, primary_location_id, raw_batch_id, 'pos_csv', 'POS-DEMO-001', target_business_id::text || ':pos_csv:POS-DEMO-001:' || current_date::text, current_date, 'summarized', 680000, 0, 680000, 0, 'qris', 'Walk-in'),
    (target_business_id, primary_location_id, raw_batch_id, 'pos_csv', 'POS-DEMO-002', target_business_id::text || ':pos_csv:POS-DEMO-002:' || current_date::text, current_date, 'summarized', 616000, 0, 616000, 0, 'cash', 'Walk-in');
  select id into raw_tx_one_id from public.raw_transactions where business_id = target_business_id and external_id = 'POS-DEMO-001';
  select id into raw_tx_two_id from public.raw_transactions where business_id = target_business_id and external_id = 'POS-DEMO-002';

  insert into public.raw_transaction_lines (business_id, raw_transaction_id, product_id, description, quantity, unit_price, total)
  values
    (target_business_id, raw_tx_one_id, product_food_id, 'Rendang Bowl', 10, 50000, 500000),
    (target_business_id, raw_tx_one_id, product_drink_id, 'Es Teh Nusantara', 10, 18000, 180000),
    (target_business_id, raw_tx_two_id, product_food_id, 'Rendang Bowl', 8, 50000, 400000),
    (target_business_id, raw_tx_two_id, product_drink_id, 'Es Teh Nusantara', 12, 18000, 216000);

  insert into public.raw_payments (business_id, raw_transaction_id, method, amount)
  values
    (target_business_id, raw_tx_one_id, 'qris', 680000),
    (target_business_id, raw_tx_two_id, 'cash', 616000);

  insert into public.daily_transaction_summaries (
    business_id,
    location_id,
    source,
    date,
    status,
    transaction_count,
    gross_amount,
    discount_amount,
    net_amount,
    tax_amount,
    payment_breakdown,
    posted_journal_entry_id
  )
  values (
    target_business_id,
    primary_location_id,
    'pos_csv',
    current_date,
    'posted',
    2,
    1296000,
    0,
    1296000,
    0,
    '{"cash":616000,"qris":680000}'::jsonb,
    sales_journal_id
  );

  insert into public.settlement_records (business_id, location_id, source, settlement_date, method, gross_amount, fee_amount, net_amount, status)
  values
    (target_business_id, primary_location_id, 'pos_csv', current_date, 'qris', 680000, 4760, 675240, 'matched'),
    (target_business_id, primary_location_id, 'pos_csv', current_date, 'cash', 616000, 0, 616000, 'matched');

  insert into public.activity_events (business_id, actor_user_id, actor_name, module, action, description)
  values
    (target_business_id, target_auth_user_id, target_email, 'accounting', 'demo sandbox seeded', 'Demo sandbox data was reset to the default seed.'),
    (target_business_id, target_auth_user_id, target_email, 'sales', 'posted invoice', 'INV-DEMO-0001 tersedia sebagai contoh transaksi.'),
    (target_business_id, target_auth_user_id, target_email, 'inventory', 'stock seeded', 'Produk, gudang, lokasi, dan stok contoh sudah dibuat.');

  return target_business_id;
end;
$$;

create or replace function public.bootstrap_demo_sandbox(
  target_auth_user_id uuid,
  target_email text,
  requested_template_id text default 'food_beverage',
  requested_role text default 'owner',
  requested_seed_version integer default 1,
  requested_reset_policy text default 'daily'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  account_record public.demo_user_accounts;
  sandbox_record public.demo_sandboxes;
  new_business_id uuid;
  normalized_email text := lower(target_email);
  template_to_use text;
  role_to_use text;
  reset_policy_to_use text;
  seed_version_to_use integer;
begin
  if target_auth_user_id is null or normalized_email = '' then
    raise exception 'Demo bootstrap requires auth user id and email.';
  end if;

  select * into account_record
  from public.demo_user_accounts
  where enabled = true
    and (
      auth_user_id = target_auth_user_id
      or lower(email) = normalized_email
    )
  order by created_at asc
  limit 1;

  if account_record.id is null then
    raise exception 'This user is not registered as a demo account.';
  end if;

  template_to_use := coalesce(nullif(account_record.template_id, ''), nullif(requested_template_id, ''), 'food_beverage');
  role_to_use := coalesce(nullif(account_record.role, ''), nullif(requested_role, ''), 'owner');
  reset_policy_to_use := coalesce(nullif(account_record.reset_policy, ''), nullif(requested_reset_policy, ''), 'daily');
  seed_version_to_use := coalesce(account_record.seed_version, requested_seed_version, 1);

  update public.demo_user_accounts
  set auth_user_id = target_auth_user_id
  where id = account_record.id
    and auth_user_id is distinct from target_auth_user_id;

  select * into sandbox_record
  from public.demo_sandboxes
  where auth_user_id = target_auth_user_id
  limit 1;

  if sandbox_record.business_id is not null then
    update public.business_members
    set role = role_to_use
    where business_id = sandbox_record.business_id
      and auth_user_id = target_auth_user_id;

    return sandbox_record.business_id;
  end if;

  insert into public.businesses (legal_name, display_name, industry, owner_name, tax_id)
  values (
    'PT Demo Valuintcorp',
    coalesce(nullif(account_record.display_name, ''), 'Demo Sandbox'),
    case when template_to_use = 'distributor' then 'retail' else template_to_use end,
    normalized_email,
    '09.999.999.9-999.000'
  )
  returning id into new_business_id;

  insert into public.demo_sandboxes (
    demo_user_account_id,
    auth_user_id,
    business_id,
    template_id,
    reset_policy,
    seed_version,
    last_reset_at,
    next_reset_at
  )
  values (
    account_record.id,
    target_auth_user_id,
    new_business_id,
    template_to_use,
    reset_policy_to_use,
    seed_version_to_use,
    now(),
    case when reset_policy_to_use = 'daily' then date_trunc('day', now()) + interval '1 day' else null end
  );

  perform public.seed_demo_sandbox_business(
    new_business_id,
    target_auth_user_id,
    normalized_email,
    role_to_use,
    template_to_use
  );

  return new_business_id;
end;
$$;

create or replace function public.reset_demo_sandbox(target_business_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  sandbox_record public.demo_sandboxes;
  account_record public.demo_user_accounts;
begin
  sandbox_record := public.require_demo_sandbox(target_business_id);

  select * into account_record
  from public.demo_user_accounts
  where id = sandbox_record.demo_user_account_id
    and enabled = true;

  if account_record.id is null then
    raise exception 'Demo account for sandbox % is not enabled.', target_business_id;
  end if;

  perform public.seed_demo_sandbox_business(
    target_business_id,
    sandbox_record.auth_user_id,
    account_record.email,
    account_record.role,
    sandbox_record.template_id
  );

  update public.demo_sandboxes
  set
    last_reset_at = now(),
    next_reset_at = case when reset_policy = 'daily' then date_trunc('day', now()) + interval '1 day' else null end,
    seed_version = account_record.seed_version,
    updated_at = now()
  where business_id = target_business_id;

  return target_business_id;
end;
$$;

create or replace function public.reset_due_demo_sandboxes()
returns table (business_id uuid, auth_user_id uuid, reset_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  sandbox_record public.demo_sandboxes;
begin
  for sandbox_record in
    select *
    from public.demo_sandboxes
    where reset_policy = 'daily'
      and (next_reset_at is null or next_reset_at <= now())
    order by next_reset_at nulls first, created_at
  loop
    perform public.reset_demo_sandbox(sandbox_record.business_id);
    business_id := sandbox_record.business_id;
    auth_user_id := sandbox_record.auth_user_id;
    reset_at := now();
    return next;
  end loop;
end;
$$;

revoke execute on function public.require_demo_sandbox(uuid) from public, anon, authenticated;
revoke execute on function public.seed_demo_sandbox_business(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.bootstrap_demo_sandbox(uuid, text, text, text, integer, text) from public, anon, authenticated;
revoke execute on function public.reset_demo_sandbox(uuid) from public, anon, authenticated;
revoke execute on function public.reset_due_demo_sandboxes() from public, anon, authenticated;

grant execute on function public.require_demo_sandbox(uuid) to service_role;
grant execute on function public.seed_demo_sandbox_business(uuid, uuid, text, text, text) to service_role;
grant execute on function public.bootstrap_demo_sandbox(uuid, text, text, text, integer, text) to service_role;
grant execute on function public.reset_demo_sandbox(uuid) to service_role;
grant execute on function public.reset_due_demo_sandboxes() to service_role;
