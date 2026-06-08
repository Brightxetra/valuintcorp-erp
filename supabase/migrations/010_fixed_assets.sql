alter table public.journal_entries
  drop constraint if exists journal_entries_source_check;

alter table public.journal_entries
  add constraint journal_entries_source_check
  check (source in ('opening_balance', 'manual_transaction', 'csv_import', 'inventory', 'fixed_asset', 'payroll', 'tax', 'reversal'));

insert into public.chart_of_accounts (business_id, code, name, type, normal_balance, category, is_system, is_active)
select business.id, account.code, account.name, account.type, account.normal_balance, account.category, true, true
from public.businesses business
cross join (
  values
    ('1310', 'Akumulasi Penyusutan', 'asset', 'credit', 'fixed_asset'),
    ('5150', 'Beban Penyusutan', 'expense', 'debit', 'operating_expense'),
    ('4200', 'Laba Pelepasan Aset', 'revenue', 'credit', 'other_income'),
    ('6100', 'Rugi Pelepasan Aset', 'expense', 'debit', 'adjustment')
) as account(code, name, type, normal_balance, category)
on conflict (business_id, code) do update set
  name = excluded.name,
  type = excluded.type,
  normal_balance = excluded.normal_balance,
  category = excluded.category,
  is_system = true,
  is_active = true;

create or replace function public.ensure_fixed_asset_accounts(target_business_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.chart_of_accounts (business_id, code, name, type, normal_balance, category, is_system, is_active)
  values
    (target_business_id, '1310', 'Akumulasi Penyusutan', 'asset', 'credit', 'fixed_asset', true, true),
    (target_business_id, '5150', 'Beban Penyusutan', 'expense', 'debit', 'operating_expense', true, true),
    (target_business_id, '4200', 'Laba Pelepasan Aset', 'revenue', 'credit', 'other_income', true, true),
    (target_business_id, '6100', 'Rugi Pelepasan Aset', 'expense', 'debit', 'adjustment', true, true)
  on conflict (business_id, code) do update set
    name = excluded.name,
    type = excluded.type,
    normal_balance = excluded.normal_balance,
    category = excluded.category,
    is_system = true,
    is_active = true;
end;
$$;

create or replace function public.ensure_fixed_asset_accounts_on_business()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_fixed_asset_accounts(new.id);
  return new;
end;
$$;

drop trigger if exists ensure_fixed_asset_accounts_on_business_trigger on public.businesses;
create trigger ensure_fixed_asset_accounts_on_business_trigger
after insert on public.businesses
for each row execute function public.ensure_fixed_asset_accounts_on_business();

create table if not exists public.fixed_assets (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  asset_no text not null,
  name text not null,
  category text not null default 'Umum',
  acquisition_date date not null,
  acquisition_cost numeric(18, 2) not null check (acquisition_cost > 0),
  residual_value numeric(18, 2) not null default 0 check (residual_value >= 0),
  useful_life_months int not null check (useful_life_months > 0),
  depreciation_method text not null default 'straight_line' check (depreciation_method in ('straight_line')),
  acquisition_type text not null default 'opening_balance' check (acquisition_type in ('opening_balance', 'cash', 'credit')),
  status text not null default 'active' check (status in ('active', 'fully_depreciated', 'disposed')),
  location_id uuid references public.locations(id),
  supplier_id uuid references public.suppliers(id),
  journal_entry_id uuid references public.journal_entries(id) on delete set null,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (residual_value < acquisition_cost),
  unique (business_id, asset_no)
);

create table if not exists public.fixed_asset_depreciation_runs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  period text not null,
  date date not null,
  status text not null default 'posted' check (status in ('posted', 'reversed')),
  total_depreciation numeric(18, 2) not null default 0 check (total_depreciation >= 0),
  journal_entry_id uuid references public.journal_entries(id) on delete set null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fixed_asset_depreciation_lines (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  run_id uuid not null references public.fixed_asset_depreciation_runs(id) on delete cascade,
  asset_id uuid not null references public.fixed_assets(id) on delete cascade,
  period text not null,
  amount numeric(18, 2) not null check (amount > 0),
  accumulated_depreciation numeric(18, 2) not null check (accumulated_depreciation >= 0),
  book_value numeric(18, 2) not null check (book_value >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.fixed_asset_disposals (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  asset_id uuid not null references public.fixed_assets(id) on delete cascade,
  date date not null,
  proceeds numeric(18, 2) not null default 0 check (proceeds >= 0),
  book_value numeric(18, 2) not null check (book_value >= 0),
  gain_loss numeric(18, 2) not null,
  reason text not null,
  status text not null default 'posted' check (status in ('posted', 'reversed')),
  journal_entry_id uuid references public.journal_entries(id) on delete set null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists fixed_asset_depreciation_runs_one_posted_period_idx
  on public.fixed_asset_depreciation_runs (business_id, period)
  where status = 'posted';

create index if not exists fixed_assets_business_status_idx
  on public.fixed_assets (business_id, status, asset_no);

create index if not exists fixed_asset_depreciation_lines_business_asset_idx
  on public.fixed_asset_depreciation_lines (business_id, asset_id, period);

create index if not exists fixed_asset_disposals_business_asset_idx
  on public.fixed_asset_disposals (business_id, asset_id, date desc);

alter table public.fixed_assets enable row level security;
alter table public.fixed_asset_depreciation_runs enable row level security;
alter table public.fixed_asset_depreciation_lines enable row level security;
alter table public.fixed_asset_disposals enable row level security;

drop policy if exists "members can read fixed assets" on public.fixed_assets;
create policy "members can read fixed assets" on public.fixed_assets for select
using (public.is_business_member(business_id));

drop policy if exists "finance can manage fixed assets" on public.fixed_assets;
create policy "finance can manage fixed assets" on public.fixed_assets for all
using (public.has_business_role(business_id, array['owner', 'finance_admin', 'system_admin']))
with check (public.has_business_role(business_id, array['owner', 'finance_admin', 'system_admin']));

drop policy if exists "members can read depreciation runs" on public.fixed_asset_depreciation_runs;
create policy "members can read depreciation runs" on public.fixed_asset_depreciation_runs for select
using (public.is_business_member(business_id));

drop policy if exists "finance can manage depreciation runs" on public.fixed_asset_depreciation_runs;
create policy "finance can manage depreciation runs" on public.fixed_asset_depreciation_runs for all
using (public.has_business_role(business_id, array['owner', 'finance_admin', 'system_admin']))
with check (public.has_business_role(business_id, array['owner', 'finance_admin', 'system_admin']));

drop policy if exists "members can read depreciation lines" on public.fixed_asset_depreciation_lines;
create policy "members can read depreciation lines" on public.fixed_asset_depreciation_lines for select
using (public.is_business_member(business_id));

drop policy if exists "finance can manage depreciation lines" on public.fixed_asset_depreciation_lines;
create policy "finance can manage depreciation lines" on public.fixed_asset_depreciation_lines for all
using (public.has_business_role(business_id, array['owner', 'finance_admin', 'system_admin']))
with check (public.has_business_role(business_id, array['owner', 'finance_admin', 'system_admin']));

drop policy if exists "members can read fixed asset disposals" on public.fixed_asset_disposals;
create policy "members can read fixed asset disposals" on public.fixed_asset_disposals for select
using (public.is_business_member(business_id));

drop policy if exists "finance can manage fixed asset disposals" on public.fixed_asset_disposals;
create policy "finance can manage fixed asset disposals" on public.fixed_asset_disposals for all
using (public.has_business_role(business_id, array['owner', 'finance_admin', 'system_admin']))
with check (public.has_business_role(business_id, array['owner', 'finance_admin', 'system_admin']));

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'fixed_assets',
    'fixed_asset_depreciation_runs',
    'fixed_asset_disposals'
  ]
  loop
    execute format('drop trigger if exists touch_%I_updated_at on public.%I', table_name, table_name);
    execute format(
      'create trigger touch_%I_updated_at before update on public.%I for each row execute function public.touch_updated_at()',
      table_name,
      table_name
    );
  end loop;
end;
$$;

create or replace function public.ensure_fixed_asset_business()
returns trigger
language plpgsql
as $$
declare
  location_business uuid;
  supplier_business uuid;
begin
  if new.location_id is not null then
    select business_id into location_business from public.locations where id = new.location_id;
    if location_business is null or location_business <> new.business_id then
      raise exception 'Fixed asset location must belong to the same business.';
    end if;
  end if;

  if new.supplier_id is not null then
    select business_id into supplier_business from public.suppliers where id = new.supplier_id;
    if supplier_business is null or supplier_business <> new.business_id then
      raise exception 'Fixed asset supplier must belong to the same business.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists ensure_fixed_asset_business_trigger on public.fixed_assets;
create trigger ensure_fixed_asset_business_trigger
before insert or update on public.fixed_assets
for each row execute function public.ensure_fixed_asset_business();

alter table public.attachments
  drop constraint if exists attachments_owner_type_check;

alter table public.attachments
  add constraint attachments_owner_type_check
  check (owner_type in ('sales_invoice', 'purchase_bill', 'payment', 'payroll_run', 'fixed_asset'));

create or replace function public.ensure_attachment_owner_business()
returns trigger
language plpgsql
as $$
declare
  owner_exists boolean;
begin
  if new.owner_type = 'sales_invoice' then
    select exists(select 1 from public.sales_invoices where id = new.owner_id and business_id = new.business_id) into owner_exists;
  elsif new.owner_type = 'purchase_bill' then
    select exists(select 1 from public.purchase_bills where id = new.owner_id and business_id = new.business_id) into owner_exists;
  elsif new.owner_type = 'payment' then
    select exists(select 1 from public.payments where id = new.owner_id and business_id = new.business_id) into owner_exists;
  elsif new.owner_type = 'payroll_run' then
    select exists(select 1 from public.payroll_runs where id = new.owner_id and business_id = new.business_id) into owner_exists;
  elsif new.owner_type = 'fixed_asset' then
    select exists(select 1 from public.fixed_assets where id = new.owner_id and business_id = new.business_id) into owner_exists;
  else
    owner_exists := false;
  end if;

  if not owner_exists then
    raise exception 'Attachment owner must exist in the same business.';
  end if;

  return new;
end;
$$;

create or replace function public.post_sales_invoice(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_business_id uuid := (payload->>'businessId')::uuid;
  target_customer_id uuid := (payload->>'customerId')::uuid;
  invoice_date date := (payload->>'date')::date;
  invoice_due_date date := (payload->>'dueDate')::date;
  line_items jsonb;
  line_item jsonb;
  line_product_id uuid;
  line_warehouse_id uuid;
  qty numeric;
  unit_price numeric;
  product_record record;
  customer_record record;
  invoice_id uuid;
  invoice_no text;
  journal_id uuid;
  role text;
  total numeric := 0;
  cogs_total numeric := 0;
  customer_open numeric;
  journal_lines jsonb;
begin
  role := public.require_posting_role(target_business_id, array['owner', 'finance_admin', 'staff', 'system_admin']);

  if public.is_period_locked(target_business_id, invoice_date) then
    raise exception 'Period is locked. Use a correction or reversal entry.';
  end if;

  if invoice_due_date < invoice_date then
    raise exception 'Due date cannot be earlier than invoice date.';
  end if;

  select * into customer_record
  from public.customers
  where id = target_customer_id and business_id = target_business_id and is_active = true;

  if customer_record.id is null then
    raise exception 'Customer is not active.';
  end if;

  line_items := case
    when jsonb_typeof(payload->'items') = 'array' then payload->'items'
    else jsonb_build_array(jsonb_build_object(
      'productId', payload->>'productId',
      'warehouseId', payload->>'warehouseId',
      'quantity', payload->>'quantity',
      'unitPrice', payload->>'unitPrice'
    ))
  end;

  for line_item in select * from jsonb_array_elements(line_items)
  loop
    line_product_id := (line_item->>'productId')::uuid;
    line_warehouse_id := nullif(line_item->>'warehouseId', '')::uuid;
    qty := (line_item->>'quantity')::numeric;
    unit_price := (line_item->>'unitPrice')::numeric;

    select * into product_record
    from public.products
    where id = line_product_id and business_id = target_business_id and is_active = true and is_sellable = true;

    if product_record.id is null then
      raise exception 'Product is not active or sellable.';
    end if;

    line_warehouse_id := coalesce(line_warehouse_id, product_record.default_warehouse_id);

    if line_warehouse_id is null then
      raise exception 'Warehouse is required.';
    end if;

    if not exists (
      select 1 from public.warehouses
      where id = line_warehouse_id and business_id = target_business_id and is_active = true
    ) then
      raise exception 'Warehouse is not active.';
    end if;

    if product_record.track_stock and public.current_stock_quantity(target_business_id, line_product_id, line_warehouse_id) < qty then
      raise exception 'Posting this invoice would create negative stock.';
    end if;

    total := total + (qty * unit_price);
    cogs_total := cogs_total + case when product_record.track_stock then qty * product_record.purchase_price else 0 end;
  end loop;

  select coalesce(sum(total - paid_amount), 0) into customer_open
  from public.sales_invoices
  where business_id = target_business_id
    and customer_id = target_customer_id
    and status not in ('void', 'paid');

  if customer_record.credit_limit = 0 then
    raise exception 'Customer has no credit limit for open AR.';
  end if;

  if customer_record.credit_limit > 0 and customer_open + total > customer_record.credit_limit then
    raise exception 'Customer credit limit exceeded.';
  end if;

  invoice_no := public.next_document_no(target_business_id, 'INV');

  insert into public.sales_invoices (
    business_id,
    invoice_no,
    customer_id,
    date,
    due_date,
    status,
    total,
    paid_amount,
    created_by
  )
  values (
    target_business_id,
    invoice_no,
    target_customer_id,
    invoice_date,
    invoice_due_date,
    'posted',
    total,
    0,
    auth.uid()
  )
  returning id into invoice_id;

  for line_item in select * from jsonb_array_elements(line_items)
  loop
    line_product_id := (line_item->>'productId')::uuid;
    line_warehouse_id := nullif(line_item->>'warehouseId', '')::uuid;
    qty := (line_item->>'quantity')::numeric;
    unit_price := (line_item->>'unitPrice')::numeric;

    select * into product_record
    from public.products
    where id = line_product_id and business_id = target_business_id and is_active = true and is_sellable = true;

    line_warehouse_id := coalesce(line_warehouse_id, product_record.default_warehouse_id);

    insert into public.sales_invoice_lines (
      business_id,
      sales_invoice_id,
      product_id,
      warehouse_id,
      description,
      quantity,
      unit_price,
      cogs
    )
    values (
      target_business_id,
      invoice_id,
      line_product_id,
      line_warehouse_id,
      product_record.name,
      qty,
      unit_price,
      product_record.purchase_price
    );
  end loop;

  journal_lines := jsonb_build_array(
    jsonb_build_object('accountCode', '1100', 'debit', total, 'credit', 0, 'memo', invoice_no),
    jsonb_build_object('accountCode', '4000', 'debit', 0, 'credit', total, 'memo', invoice_no)
  );

  if cogs_total > 0 then
    journal_lines := journal_lines || jsonb_build_array(
      jsonb_build_object('accountCode', '5000', 'debit', cogs_total, 'credit', 0, 'memo', invoice_no),
      jsonb_build_object('accountCode', '1200', 'debit', 0, 'credit', cogs_total, 'memo', invoice_no)
    );
  end if;

  journal_id := public.create_posted_journal(
    target_business_id,
    invoice_date,
    'Invoice penjualan ' || invoice_no,
    'manual_transaction',
    invoice_id,
    role,
    journal_lines
  );

  update public.sales_invoices set journal_entry_id = journal_id where id = invoice_id;

  for line_item in select * from jsonb_array_elements(line_items)
  loop
    line_product_id := (line_item->>'productId')::uuid;
    line_warehouse_id := nullif(line_item->>'warehouseId', '')::uuid;
    qty := (line_item->>'quantity')::numeric;

    select * into product_record
    from public.products
    where id = line_product_id and business_id = target_business_id and is_active = true and is_sellable = true;

    line_warehouse_id := coalesce(line_warehouse_id, product_record.default_warehouse_id);

    if product_record.track_stock then
      insert into public.stock_movements (
        business_id,
        item_id,
        warehouse_id,
        date,
        type,
        quantity,
        value,
        journal_entry_id,
        memo
      )
      values (
        target_business_id,
        line_product_id,
        line_warehouse_id,
        invoice_date,
        'sale',
        qty,
        qty * product_record.purchase_price,
        journal_id,
        invoice_no
      );
    end if;
  end loop;

  insert into public.activity_events (business_id, actor_user_id, actor_name, module, action, description)
  values (target_business_id, auth.uid(), coalesce(auth.uid()::text, 'System'), 'sales', 'posted invoice', invoice_no || ' dipost atomik.');

  return invoice_id;
end;
$$;

create or replace function public.post_purchase_bill(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_business_id uuid := (payload->>'businessId')::uuid;
  target_supplier_id uuid := (payload->>'supplierId')::uuid;
  bill_date date := (payload->>'date')::date;
  bill_due_date date := (payload->>'dueDate')::date;
  line_items jsonb;
  line_item jsonb;
  line_product_id uuid;
  line_warehouse_id uuid;
  qty numeric;
  unit_cost numeric;
  product_record record;
  bill_id uuid;
  bill_no text;
  journal_id uuid;
  role text;
  total numeric := 0;
begin
  role := public.require_posting_role(target_business_id, array['owner', 'finance_admin', 'staff', 'system_admin']);

  if public.is_period_locked(target_business_id, bill_date) then
    raise exception 'Period is locked. Use a correction or reversal entry.';
  end if;

  if bill_due_date < bill_date then
    raise exception 'Due date cannot be earlier than bill date.';
  end if;

  if not exists (
    select 1 from public.suppliers
    where id = target_supplier_id and business_id = target_business_id and is_active = true
  ) then
    raise exception 'Supplier is not active.';
  end if;

  line_items := case
    when jsonb_typeof(payload->'items') = 'array' then payload->'items'
    else jsonb_build_array(jsonb_build_object(
      'productId', payload->>'productId',
      'warehouseId', payload->>'warehouseId',
      'quantity', payload->>'quantity',
      'unitCost', payload->>'unitCost'
    ))
  end;

  for line_item in select * from jsonb_array_elements(line_items)
  loop
    line_product_id := (line_item->>'productId')::uuid;
    line_warehouse_id := nullif(line_item->>'warehouseId', '')::uuid;
    qty := (line_item->>'quantity')::numeric;
    unit_cost := (line_item->>'unitCost')::numeric;

    select * into product_record
    from public.products
    where id = line_product_id and business_id = target_business_id and is_active = true and is_purchasable = true;

    if product_record.id is null then
      raise exception 'Product is not active or purchasable.';
    end if;

    line_warehouse_id := coalesce(line_warehouse_id, product_record.default_warehouse_id);

    if line_warehouse_id is null then
      raise exception 'Warehouse is required.';
    end if;

    if not exists (
      select 1 from public.warehouses
      where id = line_warehouse_id and business_id = target_business_id and is_active = true
    ) then
      raise exception 'Warehouse is not active.';
    end if;

    total := total + (qty * unit_cost);
  end loop;

  bill_no := public.next_document_no(target_business_id, 'BILL');

  insert into public.purchase_bills (
    business_id,
    bill_no,
    supplier_id,
    date,
    due_date,
    status,
    total,
    paid_amount,
    created_by
  )
  values (
    target_business_id,
    bill_no,
    target_supplier_id,
    bill_date,
    bill_due_date,
    'posted',
    total,
    0,
    auth.uid()
  )
  returning id into bill_id;

  for line_item in select * from jsonb_array_elements(line_items)
  loop
    line_product_id := (line_item->>'productId')::uuid;
    line_warehouse_id := nullif(line_item->>'warehouseId', '')::uuid;
    qty := (line_item->>'quantity')::numeric;
    unit_cost := (line_item->>'unitCost')::numeric;

    select * into product_record
    from public.products
    where id = line_product_id and business_id = target_business_id and is_active = true and is_purchasable = true;

    line_warehouse_id := coalesce(line_warehouse_id, product_record.default_warehouse_id);

    insert into public.purchase_bill_lines (
      business_id,
      purchase_bill_id,
      product_id,
      warehouse_id,
      description,
      quantity,
      unit_cost
    )
    values (
      target_business_id,
      bill_id,
      line_product_id,
      line_warehouse_id,
      product_record.name,
      qty,
      unit_cost
    );
  end loop;

  journal_id := public.create_posted_journal(
    target_business_id,
    bill_date,
    'Bill pembelian ' || bill_no,
    'inventory',
    bill_id,
    role,
    jsonb_build_array(
      jsonb_build_object('accountCode', '1200', 'debit', total, 'credit', 0, 'memo', bill_no),
      jsonb_build_object('accountCode', '2000', 'debit', 0, 'credit', total, 'memo', bill_no)
    )
  );

  update public.purchase_bills set journal_entry_id = journal_id where id = bill_id;

  for line_item in select * from jsonb_array_elements(line_items)
  loop
    line_product_id := (line_item->>'productId')::uuid;
    line_warehouse_id := nullif(line_item->>'warehouseId', '')::uuid;
    qty := (line_item->>'quantity')::numeric;
    unit_cost := (line_item->>'unitCost')::numeric;

    select * into product_record
    from public.products
    where id = line_product_id and business_id = target_business_id and is_active = true and is_purchasable = true;

    line_warehouse_id := coalesce(line_warehouse_id, product_record.default_warehouse_id);

    if product_record.track_stock then
      insert into public.stock_movements (
        business_id,
        item_id,
        warehouse_id,
        date,
        type,
        quantity,
        value,
        journal_entry_id,
        memo
      )
      values (
        target_business_id,
        line_product_id,
        line_warehouse_id,
        bill_date,
        'purchase',
        qty,
        qty * unit_cost,
        journal_id,
        bill_no
      );
    end if;
  end loop;

  insert into public.activity_events (business_id, actor_user_id, actor_name, module, action, description)
  values (target_business_id, auth.uid(), coalesce(auth.uid()::text, 'System'), 'purchases', 'posted bill', bill_no || ' dipost atomik.');

  return bill_id;
end;
$$;

create or replace function public.post_fixed_asset(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_business_id uuid := (payload->>'businessId')::uuid;
  asset_id uuid;
  asset_no_value text := nullif(payload->>'assetNo', '');
  asset_name text := payload->>'name';
  asset_category text := coalesce(nullif(payload->>'category', ''), 'Umum');
  acquisition_date_value date := (payload->>'acquisitionDate')::date;
  acquisition_cost_value numeric := (payload->>'acquisitionCost')::numeric;
  residual_value_value numeric := coalesce((payload->>'residualValue')::numeric, 0);
  useful_life_months_value int := (payload->>'usefulLifeMonths')::int;
  acquisition_type_value text := coalesce(payload->>'acquisitionType', 'opening_balance');
  location_id_value uuid := nullif(payload->>'locationId', '')::uuid;
  supplier_id_value uuid := nullif(payload->>'supplierId', '')::uuid;
  notes_value text := nullif(payload->>'notes', '');
  journal_id uuid;
  role text;
begin
  role := public.require_posting_role(target_business_id, array['owner', 'finance_admin', 'system_admin']);
  perform public.ensure_fixed_asset_accounts(target_business_id);

  if public.is_period_locked(target_business_id, acquisition_date_value) then
    raise exception 'Period is locked. Use a correction or reversal entry.';
  end if;

  if residual_value_value >= acquisition_cost_value then
    raise exception 'Residual value must be lower than acquisition cost.';
  end if;

  asset_no_value := coalesce(asset_no_value, public.next_document_no(target_business_id, 'FA'));

  insert into public.fixed_assets (
    business_id,
    asset_no,
    name,
    category,
    acquisition_date,
    acquisition_cost,
    residual_value,
    useful_life_months,
    depreciation_method,
    acquisition_type,
    status,
    location_id,
    supplier_id,
    notes,
    created_by
  )
  values (
    target_business_id,
    asset_no_value,
    asset_name,
    asset_category,
    acquisition_date_value,
    acquisition_cost_value,
    residual_value_value,
    useful_life_months_value,
    'straight_line',
    acquisition_type_value,
    'active',
    location_id_value,
    supplier_id_value,
    notes_value,
    auth.uid()
  )
  returning id into asset_id;

  if acquisition_type_value in ('cash', 'credit') then
    journal_id := public.create_posted_journal(
      target_business_id,
      acquisition_date_value,
      'Perolehan aset tetap ' || asset_no_value,
      'fixed_asset',
      asset_id,
      role,
      jsonb_build_array(
        jsonb_build_object('accountCode', '1300', 'debit', acquisition_cost_value, 'credit', 0, 'memo', asset_no_value),
        jsonb_build_object('accountCode', case when acquisition_type_value = 'cash' then '1000' else '2000' end, 'debit', 0, 'credit', acquisition_cost_value, 'memo', asset_no_value)
      )
    );

    update public.fixed_assets set journal_entry_id = journal_id where id = asset_id;
  end if;

  insert into public.activity_events (business_id, actor_user_id, actor_name, module, action, description)
  values (target_business_id, auth.uid(), coalesce(auth.uid()::text, 'System'), 'accounting', 'fixed asset created', asset_no_value || ' dicatat.');

  return asset_id;
end;
$$;

create or replace function public.update_fixed_asset(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_business_id uuid := (payload->>'businessId')::uuid;
  target_asset_id uuid := (payload->>'id')::uuid;
  asset_record record;
  has_depreciation boolean;
  role text;
begin
  role := public.require_posting_role(target_business_id, array['owner', 'finance_admin', 'system_admin']);

  select * into asset_record
  from public.fixed_assets
  where id = target_asset_id and business_id = target_business_id;

  if asset_record.id is null then
    raise exception 'Fixed asset was not found.';
  end if;

  if asset_record.status = 'disposed' then
    raise exception 'Disposed fixed assets cannot be edited.';
  end if;

  select exists(
    select 1
    from public.fixed_asset_depreciation_lines line
    join public.fixed_asset_depreciation_runs run on run.id = line.run_id
    where line.asset_id = target_asset_id and run.status = 'posted'
  ) into has_depreciation;

  if has_depreciation and (
    (payload->>'acquisitionDate')::date <> asset_record.acquisition_date
    or (payload->>'acquisitionCost')::numeric <> asset_record.acquisition_cost
    or (payload->>'residualValue')::numeric <> asset_record.residual_value
    or (payload->>'usefulLifeMonths')::int <> asset_record.useful_life_months
    or payload->>'acquisitionType' <> asset_record.acquisition_type
  ) then
    raise exception 'Financial fields cannot be changed after depreciation has been posted.';
  end if;

  update public.fixed_assets
  set
    asset_no = coalesce(nullif(payload->>'assetNo', ''), asset_no),
    name = payload->>'name',
    category = coalesce(nullif(payload->>'category', ''), 'Umum'),
    acquisition_date = (payload->>'acquisitionDate')::date,
    acquisition_cost = (payload->>'acquisitionCost')::numeric,
    residual_value = coalesce((payload->>'residualValue')::numeric, 0),
    useful_life_months = (payload->>'usefulLifeMonths')::int,
    depreciation_method = 'straight_line',
    acquisition_type = coalesce(payload->>'acquisitionType', acquisition_type),
    location_id = nullif(payload->>'locationId', '')::uuid,
    supplier_id = nullif(payload->>'supplierId', '')::uuid,
    notes = nullif(payload->>'notes', '')
  where id = target_asset_id;

  insert into public.activity_events (business_id, actor_user_id, actor_name, module, action, description)
  values (target_business_id, auth.uid(), coalesce(auth.uid()::text, 'System'), 'accounting', 'fixed asset updated', asset_record.asset_no || ' diperbarui.');

  return target_asset_id;
end;
$$;

create or replace function public.post_fixed_asset_depreciation_run(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_business_id uuid := (payload->>'businessId')::uuid;
  target_period text := payload->>'period';
  run_date date := (payload->>'date')::date;
  role text;
  run_id uuid;
  journal_id uuid;
  asset_record record;
  accumulated_before numeric;
  depreciable_base numeric;
  depreciation_amount numeric;
  accumulated_after numeric;
  book_value_after numeric;
  total_amount numeric := 0;
begin
  role := public.require_posting_role(target_business_id, array['owner', 'finance_admin', 'system_admin']);
  perform public.ensure_fixed_asset_accounts(target_business_id);

  if public.is_period_locked(target_business_id, run_date) then
    raise exception 'Period is locked. Use a correction or reversal entry.';
  end if;

  if exists (
    select 1 from public.fixed_asset_depreciation_runs
    where business_id = target_business_id and period = target_period and status = 'posted'
  ) then
    raise exception 'Depreciation has already been posted for this period.';
  end if;

  insert into public.fixed_asset_depreciation_runs (business_id, period, date, status, total_depreciation, created_by)
  values (target_business_id, target_period, run_date, 'posted', 0, auth.uid())
  returning id into run_id;

  for asset_record in
    select *
    from public.fixed_assets
    where business_id = target_business_id
      and status = 'active'
      and acquisition_date <= run_date
    order by asset_no
  loop
    select coalesce(sum(line.amount), 0) into accumulated_before
    from public.fixed_asset_depreciation_lines line
    join public.fixed_asset_depreciation_runs run on run.id = line.run_id
    where line.business_id = target_business_id
      and line.asset_id = asset_record.id
      and run.status = 'posted';

    depreciable_base := greatest(asset_record.acquisition_cost - asset_record.residual_value, 0);
    depreciation_amount := least(round(depreciable_base / asset_record.useful_life_months), greatest(depreciable_base - accumulated_before, 0));

    if depreciation_amount > 0 then
      accumulated_after := accumulated_before + depreciation_amount;
      book_value_after := greatest(asset_record.acquisition_cost - accumulated_after, 0);
      total_amount := total_amount + depreciation_amount;

      insert into public.fixed_asset_depreciation_lines (
        business_id,
        run_id,
        asset_id,
        period,
        amount,
        accumulated_depreciation,
        book_value
      )
      values (
        target_business_id,
        run_id,
        asset_record.id,
        target_period,
        depreciation_amount,
        accumulated_after,
        book_value_after
      );

      if book_value_after <= asset_record.residual_value then
        update public.fixed_assets set status = 'fully_depreciated' where id = asset_record.id;
      end if;
    end if;
  end loop;

  if total_amount <= 0 then
    delete from public.fixed_asset_depreciation_runs where id = run_id;
    raise exception 'No fixed assets are eligible for depreciation.';
  end if;

  journal_id := public.create_posted_journal(
    target_business_id,
    run_date,
    'Penyusutan aset tetap ' || target_period,
    'fixed_asset',
    run_id,
    role,
    jsonb_build_array(
      jsonb_build_object('accountCode', '5150', 'debit', total_amount, 'credit', 0, 'memo', target_period),
      jsonb_build_object('accountCode', '1310', 'debit', 0, 'credit', total_amount, 'memo', target_period)
    )
  );

  update public.fixed_asset_depreciation_runs
  set total_depreciation = total_amount,
      journal_entry_id = journal_id
  where id = run_id;

  insert into public.activity_events (business_id, actor_user_id, actor_name, module, action, description)
  values (target_business_id, auth.uid(), coalesce(auth.uid()::text, 'System'), 'accounting', 'fixed asset depreciation', 'Penyusutan ' || target_period || ' dipost.');

  return run_id;
end;
$$;

create or replace function public.post_fixed_asset_disposal(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_business_id uuid := (payload->>'businessId')::uuid;
  target_asset_id uuid := (payload->>'assetId')::uuid;
  disposal_date date := (payload->>'date')::date;
  proceeds_amount numeric := coalesce((payload->>'proceeds')::numeric, 0);
  reason_text text := payload->>'reason';
  role text;
  asset_record record;
  accumulated_amount numeric;
  book_value_amount numeric;
  gain_loss_amount numeric;
  disposal_id uuid;
  journal_id uuid;
  journal_lines jsonb := '[]'::jsonb;
begin
  role := public.require_posting_role(target_business_id, array['owner', 'finance_admin', 'system_admin']);
  perform public.ensure_fixed_asset_accounts(target_business_id);

  if public.is_period_locked(target_business_id, disposal_date) then
    raise exception 'Period is locked. Use a correction or reversal entry.';
  end if;

  select * into asset_record
  from public.fixed_assets
  where id = target_asset_id and business_id = target_business_id;

  if asset_record.id is null then
    raise exception 'Fixed asset was not found.';
  end if;

  if asset_record.status = 'disposed' then
    raise exception 'Fixed asset has already been disposed.';
  end if;

  select coalesce(sum(line.amount), 0) into accumulated_amount
  from public.fixed_asset_depreciation_lines line
  join public.fixed_asset_depreciation_runs run on run.id = line.run_id
  where line.business_id = target_business_id
    and line.asset_id = target_asset_id
    and run.status = 'posted';

  book_value_amount := greatest(asset_record.acquisition_cost - accumulated_amount, 0);
  gain_loss_amount := proceeds_amount - book_value_amount;

  insert into public.fixed_asset_disposals (
    business_id,
    asset_id,
    date,
    proceeds,
    book_value,
    gain_loss,
    reason,
    status,
    created_by
  )
  values (
    target_business_id,
    target_asset_id,
    disposal_date,
    proceeds_amount,
    book_value_amount,
    gain_loss_amount,
    reason_text,
    'posted',
    auth.uid()
  )
  returning id into disposal_id;

  if proceeds_amount > 0 then
    journal_lines := journal_lines || jsonb_build_array(
      jsonb_build_object('accountCode', '1000', 'debit', proceeds_amount, 'credit', 0, 'memo', asset_record.asset_no)
    );
  end if;

  if accumulated_amount > 0 then
    journal_lines := journal_lines || jsonb_build_array(
      jsonb_build_object('accountCode', '1310', 'debit', accumulated_amount, 'credit', 0, 'memo', asset_record.asset_no)
    );
  end if;

  if gain_loss_amount < 0 then
    journal_lines := journal_lines || jsonb_build_array(
      jsonb_build_object('accountCode', '6100', 'debit', abs(gain_loss_amount), 'credit', 0, 'memo', asset_record.asset_no)
    );
  end if;

  journal_lines := journal_lines || jsonb_build_array(
    jsonb_build_object('accountCode', '1300', 'debit', 0, 'credit', asset_record.acquisition_cost, 'memo', asset_record.asset_no)
  );

  if gain_loss_amount > 0 then
    journal_lines := journal_lines || jsonb_build_array(
      jsonb_build_object('accountCode', '4200', 'debit', 0, 'credit', gain_loss_amount, 'memo', asset_record.asset_no)
    );
  end if;

  journal_id := public.create_posted_journal(
    target_business_id,
    disposal_date,
    'Pelepasan aset tetap ' || asset_record.asset_no,
    'fixed_asset',
    disposal_id,
    role,
    journal_lines
  );

  update public.fixed_asset_disposals set journal_entry_id = journal_id where id = disposal_id;
  update public.fixed_assets set status = 'disposed' where id = target_asset_id;

  insert into public.activity_events (business_id, actor_user_id, actor_name, module, action, description)
  values (target_business_id, auth.uid(), coalesce(auth.uid()::text, 'System'), 'accounting', 'fixed asset disposed', asset_record.asset_no || ' dilepas.');

  return disposal_id;
end;
$$;

create or replace function public.reverse_fixed_asset_document(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_business_id uuid := (payload->>'businessId')::uuid;
  target_type text := payload->>'targetType';
  target_id uuid := (payload->>'targetId')::uuid;
  reversal_date date := (payload->>'date')::date;
  reason_text text := payload->>'reason';
  role text;
  original_journal_id uuid;
  reversal_id uuid;
  reversal_lines jsonb;
  affected_asset_id uuid;
begin
  role := public.require_posting_role(target_business_id, array['owner', 'finance_admin', 'system_admin']);

  if public.is_period_locked(target_business_id, reversal_date) then
    raise exception 'Period is locked. Use a correction or reversal entry.';
  end if;

  if target_type = 'depreciation_run' then
    select journal_entry_id into original_journal_id
    from public.fixed_asset_depreciation_runs
    where id = target_id and business_id = target_business_id and status = 'posted';
  elsif target_type = 'disposal' then
    select journal_entry_id, asset_id into original_journal_id, affected_asset_id
    from public.fixed_asset_disposals
    where id = target_id and business_id = target_business_id and status = 'posted';
  else
    raise exception 'Unsupported fixed asset reversal target.';
  end if;

  if original_journal_id is null then
    raise exception 'Fixed asset document was not found or already reversed.';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'accountCode', account.code,
      'debit', line.credit,
      'credit', line.debit,
      'memo', reason_text
    )
  ) into reversal_lines
  from public.journal_lines line
  join public.chart_of_accounts account on account.id = line.account_id
  where line.journal_entry_id = original_journal_id;

  reversal_id := public.create_posted_journal(
    target_business_id,
    reversal_date,
    'Reversal aset tetap ' || target_type,
    'reversal',
    original_journal_id,
    role,
    reversal_lines
  );

  update public.journal_entries
  set status = 'reversed',
      reversed_entry_id = reversal_id
  where id = original_journal_id;

  if target_type = 'depreciation_run' then
    update public.fixed_asset_depreciation_runs set status = 'reversed' where id = target_id;
    update public.fixed_assets asset
    set status = 'active'
    where business_id = target_business_id
      and status = 'fully_depreciated'
      and exists (
        select 1 from public.fixed_asset_depreciation_lines line
        where line.run_id = target_id and line.asset_id = asset.id
      );
  else
    update public.fixed_asset_disposals set status = 'reversed' where id = target_id;
    update public.fixed_assets set status = 'active' where id = affected_asset_id;
  end if;

  insert into public.activity_events (business_id, actor_user_id, actor_name, module, action, description)
  values (target_business_id, auth.uid(), coalesce(auth.uid()::text, 'System'), 'accounting', 'fixed asset reversed', target_type || ' dibalik: ' || reason_text);

  return reversal_id;
end;
$$;
