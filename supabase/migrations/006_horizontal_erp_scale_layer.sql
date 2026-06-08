alter table public.products
  add column if not exists product_type text not null default 'stock_item'
  check (product_type in ('stock_item', 'non_stock_item', 'service', 'bundle'));

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  code text not null,
  name text not null,
  type text not null default 'branch' check (type in ('branch', 'outlet', 'store', 'warehouse', 'workshop', 'office')),
  warehouse_id uuid references public.warehouses(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, code)
);

create table if not exists public.industry_templates (
  id text primary key,
  industry text not null,
  name text not null,
  description text not null,
  enabled_modules text[] not null,
  default_product_type text not null check (default_product_type in ('stock_item', 'non_stock_item', 'service', 'bundle')),
  created_at timestamptz not null default now()
);

create table if not exists public.business_feature_flags (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  module text not null check (module in (
    'dashboard',
    'sales',
    'purchases',
    'inventory',
    'accounting',
    'reports',
    'hr',
    'payroll',
    'tax',
    'imports',
    'locations'
  )),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (business_id, module)
);

create table if not exists public.transaction_sources (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid references public.locations(id),
  source_type text not null check (source_type in ('manual', 'pos', 'marketplace', 'bank_csv', 'pos_csv', 'marketplace_csv')),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.raw_import_batches (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid references public.locations(id),
  source text not null check (source in ('manual', 'pos', 'marketplace', 'bank_csv', 'pos_csv', 'marketplace_csv')),
  status text not null default 'uploaded' check (status in (
    'uploaded',
    'validated',
    'mapped',
    'summarized',
    'posted',
    'rolled_back',
    'failed',
    'duplicate'
  )),
  total_rows integer not null default 0 check (total_rows >= 0),
  valid_rows integer not null default 0 check (valid_rows >= 0),
  duplicate_rows integer not null default 0 check (duplicate_rows >= 0),
  error_rows integer not null default 0 check (error_rows >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.raw_transactions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid not null references public.locations(id),
  batch_id uuid references public.raw_import_batches(id) on delete set null,
  source text not null check (source in ('manual', 'pos', 'marketplace', 'bank_csv', 'pos_csv', 'marketplace_csv')),
  external_id text not null,
  idempotency_key text not null,
  transaction_date date not null,
  status text not null default 'uploaded' check (status in (
    'uploaded',
    'validated',
    'mapped',
    'summarized',
    'posted',
    'rolled_back',
    'failed',
    'duplicate'
  )),
  gross_amount numeric(18, 2) not null check (gross_amount >= 0),
  discount_amount numeric(18, 2) not null default 0 check (discount_amount >= 0),
  net_amount numeric(18, 2) not null check (net_amount >= 0),
  tax_amount numeric(18, 2) not null default 0 check (tax_amount >= 0),
  payment_method text not null default 'cash' check (payment_method in ('cash', 'bank_transfer', 'qris', 'marketplace', 'other')),
  customer_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.raw_transaction_lines (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  raw_transaction_id uuid not null references public.raw_transactions(id) on delete cascade,
  product_id uuid references public.products(id),
  description text not null,
  quantity numeric(18, 4) not null check (quantity > 0),
  unit_price numeric(18, 2) not null check (unit_price >= 0),
  total numeric(18, 2) not null check (total >= 0)
);

create table if not exists public.raw_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  raw_transaction_id uuid not null references public.raw_transactions(id) on delete cascade,
  method text not null check (method in ('cash', 'bank_transfer', 'qris', 'marketplace', 'other')),
  amount numeric(18, 2) not null check (amount >= 0)
);

create table if not exists public.settlement_records (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid references public.locations(id),
  source text not null check (source in ('manual', 'pos', 'marketplace', 'bank_csv', 'pos_csv', 'marketplace_csv')),
  settlement_date date not null,
  method text not null check (method in ('cash', 'bank_transfer', 'qris', 'marketplace', 'other')),
  gross_amount numeric(18, 2) not null check (gross_amount >= 0),
  fee_amount numeric(18, 2) not null default 0 check (fee_amount >= 0),
  net_amount numeric(18, 2) not null check (net_amount >= 0),
  status text not null default 'pending' check (status in ('pending', 'matched', 'exception')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_transaction_summaries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid not null references public.locations(id),
  source text not null check (source in ('manual', 'pos', 'marketplace', 'bank_csv', 'pos_csv', 'marketplace_csv')),
  date date not null,
  status text not null default 'summarized' check (status in ('draft', 'summarized', 'posted', 'rolled_back')),
  transaction_count integer not null default 0 check (transaction_count >= 0),
  gross_amount numeric(18, 2) not null default 0 check (gross_amount >= 0),
  discount_amount numeric(18, 2) not null default 0 check (discount_amount >= 0),
  net_amount numeric(18, 2) not null default 0 check (net_amount >= 0),
  tax_amount numeric(18, 2) not null default 0 check (tax_amount >= 0),
  payment_breakdown jsonb not null default '{}'::jsonb,
  posted_journal_entry_id uuid references public.journal_entries(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, location_id, source, date)
);

create unique index if not exists raw_transactions_idempotency_active_idx
  on public.raw_transactions (business_id, idempotency_key)
  where status <> 'duplicate';

create index if not exists locations_business_active_idx on public.locations (business_id, is_active, code);
create index if not exists feature_flags_business_module_idx on public.business_feature_flags (business_id, module);
create index if not exists transaction_sources_business_location_idx on public.transaction_sources (business_id, location_id, source_type);
create index if not exists raw_import_batches_business_status_idx on public.raw_import_batches (business_id, status, created_at desc);
create index if not exists raw_transactions_business_location_date_idx on public.raw_transactions (business_id, location_id, transaction_date desc);
create index if not exists raw_transactions_business_source_external_idx on public.raw_transactions (business_id, source, external_id);
create index if not exists raw_transactions_business_status_idx on public.raw_transactions (business_id, status);
create index if not exists raw_transaction_lines_business_raw_idx on public.raw_transaction_lines (business_id, raw_transaction_id);
create index if not exists raw_payments_business_raw_idx on public.raw_payments (business_id, raw_transaction_id);
create index if not exists settlement_records_business_location_date_idx on public.settlement_records (business_id, location_id, settlement_date desc);
create index if not exists daily_summaries_business_location_date_idx on public.daily_transaction_summaries (business_id, location_id, date desc);
create index if not exists daily_summaries_business_status_idx on public.daily_transaction_summaries (business_id, status);

alter table public.locations enable row level security;
alter table public.industry_templates enable row level security;
alter table public.business_feature_flags enable row level security;
alter table public.transaction_sources enable row level security;
alter table public.raw_import_batches enable row level security;
alter table public.raw_transactions enable row level security;
alter table public.raw_transaction_lines enable row level security;
alter table public.raw_payments enable row level security;
alter table public.settlement_records enable row level security;
alter table public.daily_transaction_summaries enable row level security;

drop policy if exists "members can read locations" on public.locations;
create policy "members can read locations" on public.locations for select using (public.is_business_member(business_id));
drop policy if exists "owners can manage locations" on public.locations;
create policy "owners can manage locations" on public.locations for all
using (public.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'system_admin']))
with check (public.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'system_admin']));

drop policy if exists "any authenticated user can read industry templates" on public.industry_templates;
create policy "any authenticated user can read industry templates" on public.industry_templates for select using (auth.uid() is not null);

drop policy if exists "members can read feature flags" on public.business_feature_flags;
create policy "members can read feature flags" on public.business_feature_flags for select using (public.is_business_member(business_id));
drop policy if exists "owners can manage feature flags" on public.business_feature_flags;
create policy "owners can manage feature flags" on public.business_feature_flags for all
using (public.has_business_role(business_id, array['owner', 'finance_admin', 'system_admin']))
with check (public.has_business_role(business_id, array['owner', 'finance_admin', 'system_admin']));

drop policy if exists "members can read transaction sources" on public.transaction_sources;
create policy "members can read transaction sources" on public.transaction_sources for select using (public.is_business_member(business_id));
drop policy if exists "finance can manage transaction sources" on public.transaction_sources;
create policy "finance can manage transaction sources" on public.transaction_sources for all
using (public.has_business_role(business_id, array['owner', 'finance_admin', 'system_admin']))
with check (public.has_business_role(business_id, array['owner', 'finance_admin', 'system_admin']));

drop policy if exists "members can read raw import batches" on public.raw_import_batches;
create policy "members can read raw import batches" on public.raw_import_batches for select using (public.is_business_member(business_id));
drop policy if exists "finance can manage raw import batches" on public.raw_import_batches;
create policy "finance can manage raw import batches" on public.raw_import_batches for all
using (public.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'system_admin']))
with check (public.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'system_admin']));

drop policy if exists "members can read raw transactions" on public.raw_transactions;
create policy "members can read raw transactions" on public.raw_transactions for select using (public.is_business_member(business_id));
drop policy if exists "finance can manage raw transactions" on public.raw_transactions;
create policy "finance can manage raw transactions" on public.raw_transactions for all
using (public.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'system_admin']))
with check (public.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'system_admin']));

drop policy if exists "members can read raw transaction lines" on public.raw_transaction_lines;
create policy "members can read raw transaction lines" on public.raw_transaction_lines for select using (public.is_business_member(business_id));
drop policy if exists "finance can manage raw transaction lines" on public.raw_transaction_lines;
create policy "finance can manage raw transaction lines" on public.raw_transaction_lines for all
using (public.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'system_admin']))
with check (public.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'system_admin']));

drop policy if exists "members can read raw payments" on public.raw_payments;
create policy "members can read raw payments" on public.raw_payments for select using (public.is_business_member(business_id));
drop policy if exists "finance can manage raw payments" on public.raw_payments;
create policy "finance can manage raw payments" on public.raw_payments for all
using (public.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'system_admin']))
with check (public.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'system_admin']));

drop policy if exists "members can read settlements" on public.settlement_records;
create policy "members can read settlements" on public.settlement_records for select using (public.is_business_member(business_id));
drop policy if exists "finance can manage settlements" on public.settlement_records;
create policy "finance can manage settlements" on public.settlement_records for all
using (public.has_business_role(business_id, array['owner', 'finance_admin', 'system_admin']))
with check (public.has_business_role(business_id, array['owner', 'finance_admin', 'system_admin']));

drop policy if exists "members can read daily summaries" on public.daily_transaction_summaries;
create policy "members can read daily summaries" on public.daily_transaction_summaries for select using (public.is_business_member(business_id));
drop policy if exists "finance can manage daily summaries" on public.daily_transaction_summaries;
create policy "finance can manage daily summaries" on public.daily_transaction_summaries for all
using (public.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'system_admin']))
with check (public.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'system_admin']));

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'locations',
    'business_feature_flags',
    'transaction_sources',
    'raw_import_batches',
    'settlement_records',
    'daily_transaction_summaries'
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

insert into public.industry_templates (id, industry, name, description, enabled_modules, default_product_type)
values
  ('general', 'general', 'General UMKM', 'Template horizontal untuk usaha umum.', array['dashboard','sales','purchases','accounting','reports','tax'], 'non_stock_item'),
  ('service', 'service', 'Jasa', 'Template untuk jasa, salon, bengkel jasa, konsultan, dan agensi.', array['dashboard','sales','purchases','accounting','reports','hr','payroll','tax'], 'service'),
  ('retail', 'retail', 'Retail', 'Template retail offline dengan SKU, stok, cabang, invoice, settlement, dan laporan stok.', array['dashboard','sales','purchases','inventory','accounting','reports','imports','locations','tax'], 'stock_item'),
  ('food_beverage', 'food_beverage', 'F&B Ringan', 'Template F&B multi-outlet ringan dengan daily sales, stok sederhana, payroll, dan pajak.', array['dashboard','sales','purchases','inventory','accounting','reports','hr','payroll','imports','locations','tax'], 'stock_item'),
  ('online_seller', 'online_seller', 'Online Seller', 'Template seller marketplace/social commerce dengan import transaksi, settlement, dan rekonsiliasi channel.', array['dashboard','sales','purchases','inventory','accounting','reports','imports','locations','tax'], 'stock_item'),
  ('distributor', 'retail', 'Distributor Kecil', 'Template distributor ringan dengan multi-gudang, invoice B2B, AR/AP, dan stok per lokasi.', array['dashboard','sales','purchases','inventory','accounting','reports','locations','tax'], 'stock_item')
on conflict (id) do update set
  industry = excluded.industry,
  name = excluded.name,
  description = excluded.description,
  enabled_modules = excluded.enabled_modules,
  default_product_type = excluded.default_product_type;

insert into public.locations (business_id, code, name, type, warehouse_id)
select warehouse.business_id, 'LOC-' || warehouse.code, warehouse.name, 'warehouse', warehouse.id
from public.warehouses warehouse
where not exists (
  select 1 from public.locations location
  where location.business_id = warehouse.business_id
    and location.warehouse_id = warehouse.id
);

create or replace function public.idempotency_key_for_raw_transaction(
  target_business_id uuid,
  target_location_id uuid,
  target_source text,
  target_external_id text,
  target_transaction_date date
)
returns text
language sql
immutable
as $$
  select target_business_id::text || '|' || target_location_id::text || '|' || target_source || '|' || target_external_id || '|' || target_transaction_date::text;
$$;

create or replace function public.refresh_raw_import_batch_counts(target_batch_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  counts record;
  next_status text;
begin
  select
    count(*)::int as total_rows,
    count(*) filter (where status in ('validated', 'mapped', 'summarized', 'posted'))::int as valid_rows,
    count(*) filter (where status = 'duplicate')::int as duplicate_rows,
    count(*) filter (where status = 'failed')::int as error_rows,
    bool_and(status = 'posted') as all_posted,
    bool_and(status = 'rolled_back') as all_rolled_back,
    bool_or(status = 'summarized') as has_summarized,
    bool_or(status = 'mapped') as has_mapped,
    bool_or(status = 'validated') as has_validated,
    bool_or(status = 'failed') as has_failed
  into counts
  from public.raw_transactions
  where batch_id = target_batch_id;

  next_status := case
    when coalesce(counts.total_rows, 0) = 0 then 'uploaded'
    when counts.all_posted then 'posted'
    when counts.all_rolled_back then 'rolled_back'
    when counts.has_failed then 'failed'
    when counts.has_summarized then 'summarized'
    when counts.has_mapped then 'mapped'
    when counts.has_validated then 'validated'
    else 'uploaded'
  end;

  update public.raw_import_batches
  set
    status = next_status,
    total_rows = coalesce(counts.total_rows, 0),
    valid_rows = coalesce(counts.valid_rows, 0),
    duplicate_rows = coalesce(counts.duplicate_rows, 0),
    error_rows = coalesce(counts.error_rows, 0)
  where id = target_batch_id;
end;
$$;

create or replace function public.ensure_raw_transaction_line_consistency()
returns trigger
language plpgsql
as $$
declare
  transaction_business uuid;
  product_business uuid;
begin
  select business_id into transaction_business
  from public.raw_transactions
  where id = new.raw_transaction_id;

  if transaction_business is null or transaction_business <> new.business_id then
    raise exception 'Raw transaction line must belong to the same business as the raw transaction.';
  end if;

  if new.product_id is not null then
    select business_id into product_business
    from public.products
    where id = new.product_id;

    if product_business is null or product_business <> new.business_id then
      raise exception 'Raw transaction line product must belong to the same business.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists ensure_raw_transaction_line_consistency_trigger on public.raw_transaction_lines;
create trigger ensure_raw_transaction_line_consistency_trigger
before insert or update on public.raw_transaction_lines
for each row execute function public.ensure_raw_transaction_line_consistency();

create or replace function public.apply_industry_template(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_business_id uuid := (payload->>'businessId')::uuid;
  target_template_id text := payload->>'templateId';
  template_record record;
  enabled_module text;
  default_warehouse uuid;
begin
  perform public.require_posting_role(target_business_id, array['owner', 'finance_admin', 'system_admin']);

  select * into template_record
  from public.industry_templates
  where id = target_template_id;

  if template_record.id is null then
    raise exception 'Industry template % does not exist.', target_template_id;
  end if;

  update public.businesses
  set industry = case when target_template_id = 'distributor' then 'retail' else template_record.industry end
  where id = target_business_id;

  delete from public.business_feature_flags where business_id = target_business_id;

  foreach enabled_module in array template_record.enabled_modules
  loop
    insert into public.business_feature_flags (business_id, module, enabled)
    values (target_business_id, enabled_module, true)
    on conflict (business_id, module) do update set enabled = true;
  end loop;

  select id into default_warehouse
  from public.warehouses
  where business_id = target_business_id and is_active = true
  order by code
  limit 1;

  if default_warehouse is not null and not exists (select 1 from public.locations where business_id = target_business_id) then
    insert into public.locations (business_id, code, name, type, warehouse_id)
    values (target_business_id, 'LOC-001', 'Lokasi Utama', 'branch', default_warehouse);
  end if;

  insert into public.activity_events (business_id, actor_user_id, actor_name, module, action, description)
  values (
    target_business_id,
    auth.uid(),
    coalesce(auth.uid()::text, 'System'),
    'accounting',
    'template applied',
    'Template ' || target_template_id || ' was applied.'
  );

  return target_business_id;
end;
$$;

create or replace function public.upload_raw_transactions(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_business_id uuid := (payload->>'businessId')::uuid;
  target_location_id uuid := (payload->>'locationId')::uuid;
  target_source text := payload->>'source';
  batch_id uuid;
  transaction_payload jsonb;
  transaction_id uuid;
  transaction_key text;
  transaction_status text;
  line_payload jsonb;
begin
  perform public.require_posting_role(target_business_id, array['owner', 'finance_admin', 'staff', 'system_admin']);

  if not exists (
    select 1 from public.locations
    where id = target_location_id and business_id = target_business_id and is_active = true
  ) then
    raise exception 'Location is not active for this business.';
  end if;

  insert into public.raw_import_batches (business_id, location_id, source, status)
  values (target_business_id, target_location_id, target_source, 'uploaded')
  returning id into batch_id;

  for transaction_payload in select * from jsonb_array_elements(payload->'transactions')
  loop
    transaction_key := public.idempotency_key_for_raw_transaction(
      target_business_id,
      target_location_id,
      target_source,
      transaction_payload->>'externalId',
      (transaction_payload->>'transactionDate')::date
    );
    transaction_status := case
      when exists (
        select 1 from public.raw_transactions
        where business_id = target_business_id
          and idempotency_key = transaction_key
          and status <> 'duplicate'
      ) then 'duplicate'
      else 'uploaded'
    end;

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
    values (
      target_business_id,
      target_location_id,
      batch_id,
      target_source,
      transaction_payload->>'externalId',
      transaction_key,
      (transaction_payload->>'transactionDate')::date,
      transaction_status,
      (transaction_payload->>'grossAmount')::numeric,
      coalesce((transaction_payload->>'discountAmount')::numeric, 0),
      (transaction_payload->>'netAmount')::numeric,
      coalesce((transaction_payload->>'taxAmount')::numeric, 0),
      coalesce(transaction_payload->>'paymentMethod', 'cash'),
      nullif(transaction_payload->>'customerName', '')
    )
    returning id into transaction_id;

    insert into public.raw_payments (business_id, raw_transaction_id, method, amount)
    values (
      target_business_id,
      transaction_id,
      coalesce(transaction_payload->>'paymentMethod', 'cash'),
      (transaction_payload->>'netAmount')::numeric
    );

    for line_payload in select * from jsonb_array_elements(coalesce(transaction_payload->'lines', '[]'::jsonb))
    loop
      insert into public.raw_transaction_lines (
        business_id,
        raw_transaction_id,
        product_id,
        description,
        quantity,
        unit_price,
        total
      )
      values (
        target_business_id,
        transaction_id,
        nullif(line_payload->>'productId', '')::uuid,
        line_payload->>'description',
        (line_payload->>'quantity')::numeric,
        (line_payload->>'unitPrice')::numeric,
        (line_payload->>'total')::numeric
      );
    end loop;
  end loop;

  perform public.refresh_raw_import_batch_counts(batch_id);

  insert into public.activity_events (business_id, actor_user_id, actor_name, module, action, description)
  values (
    target_business_id,
    auth.uid(),
    coalesce(auth.uid()::text, 'System'),
    'accounting',
    'raw import uploaded',
    'Raw import batch ' || batch_id::text || ' uploaded.'
  );

  return batch_id;
end;
$$;

create or replace function public.validate_raw_import_batch(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_business_id uuid := (payload->>'businessId')::uuid;
  target_batch_id uuid := (payload->>'batchId')::uuid;
begin
  perform public.require_posting_role(target_business_id, array['owner', 'finance_admin', 'staff', 'system_admin']);

  if not exists (select 1 from public.raw_import_batches where id = target_batch_id and business_id = target_business_id) then
    raise exception 'Raw import batch does not exist.';
  end if;

  update public.raw_transactions
  set status = case
    when status = 'duplicate' then 'duplicate'
    when gross_amount - discount_amount + tax_amount = net_amount then 'validated'
    else 'failed'
  end
  where business_id = target_business_id
    and batch_id = target_batch_id
    and status in ('uploaded', 'duplicate');

  perform public.refresh_raw_import_batch_counts(target_batch_id);

  insert into public.activity_events (business_id, actor_user_id, actor_name, module, action, description)
  values (
    target_business_id,
    auth.uid(),
    coalesce(auth.uid()::text, 'System'),
    'accounting',
    'raw import validated',
    'Raw import batch ' || target_batch_id::text || ' validated.'
  );

  return target_batch_id;
end;
$$;

create or replace function public.summarize_raw_import_batch(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_business_id uuid := (payload->>'businessId')::uuid;
  target_batch_id uuid := (payload->>'batchId')::uuid;
  group_record record;
begin
  perform public.require_posting_role(target_business_id, array['owner', 'finance_admin', 'staff', 'system_admin']);

  if not exists (select 1 from public.raw_import_batches where id = target_batch_id and business_id = target_business_id) then
    raise exception 'Raw import batch does not exist.';
  end if;

  for group_record in
    select
      business_id,
      location_id,
      source,
      transaction_date,
      count(*)::int as transaction_count,
      sum(gross_amount) as gross_amount,
      sum(discount_amount) as discount_amount,
      sum(net_amount) as net_amount,
      sum(tax_amount) as tax_amount,
      (
        select jsonb_object_agg(payment_method, amount)
        from (
          select payment_method, sum(net_amount) as amount
          from public.raw_transactions method_tx
          where method_tx.business_id = tx.business_id
            and method_tx.location_id = tx.location_id
            and method_tx.source = tx.source
            and method_tx.transaction_date = tx.transaction_date
            and method_tx.batch_id = target_batch_id
            and method_tx.status in ('validated', 'mapped')
          group by payment_method
        ) method_totals
      ) as payment_breakdown
    from public.raw_transactions tx
    where business_id = target_business_id
      and batch_id = target_batch_id
      and status in ('validated', 'mapped')
    group by business_id, location_id, source, transaction_date
  loop
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
      payment_breakdown
    )
    values (
      group_record.business_id,
      group_record.location_id,
      group_record.source,
      group_record.transaction_date,
      'summarized',
      group_record.transaction_count,
      group_record.gross_amount,
      group_record.discount_amount,
      group_record.net_amount,
      group_record.tax_amount,
      coalesce(group_record.payment_breakdown, '{}'::jsonb)
    )
    on conflict (business_id, location_id, source, date)
    do update set
      status = case
        when public.daily_transaction_summaries.status = 'posted' then public.daily_transaction_summaries.status
        else 'summarized'
      end,
      transaction_count = public.daily_transaction_summaries.transaction_count + excluded.transaction_count,
      gross_amount = public.daily_transaction_summaries.gross_amount + excluded.gross_amount,
      discount_amount = public.daily_transaction_summaries.discount_amount + excluded.discount_amount,
      net_amount = public.daily_transaction_summaries.net_amount + excluded.net_amount,
      tax_amount = public.daily_transaction_summaries.tax_amount + excluded.tax_amount,
      payment_breakdown = excluded.payment_breakdown;
  end loop;

  update public.raw_transactions
  set status = 'summarized'
  where business_id = target_business_id
    and batch_id = target_batch_id
    and status in ('validated', 'mapped');

  perform public.refresh_raw_import_batch_counts(target_batch_id);

  insert into public.activity_events (business_id, actor_user_id, actor_name, module, action, description)
  values (
    target_business_id,
    auth.uid(),
    coalesce(auth.uid()::text, 'System'),
    'accounting',
    'raw import summarized',
    'Raw import batch ' || target_batch_id::text || ' summarized.'
  );

  return target_batch_id;
end;
$$;

create or replace function public.post_daily_summary(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_business_id uuid := (payload->>'businessId')::uuid;
  target_summary_id uuid := (payload->>'summaryId')::uuid;
  summary_record record;
  role text;
  journal_id uuid;
  revenue_amount numeric;
  journal_lines jsonb;
begin
  role := public.require_posting_role(target_business_id, array['owner', 'finance_admin', 'staff', 'system_admin']);

  select * into summary_record
  from public.daily_transaction_summaries
  where id = target_summary_id and business_id = target_business_id
  for update;

  if summary_record.id is null then
    raise exception 'Daily transaction summary does not exist.';
  end if;

  if summary_record.status = 'posted' then
    return summary_record.id;
  end if;

  if summary_record.status <> 'summarized' then
    raise exception 'Only summarized daily transactions can be posted.';
  end if;

  if public.is_period_locked(target_business_id, summary_record.date) then
    raise exception 'Period is locked. Use a correction or reversal entry.';
  end if;

  revenue_amount := greatest(summary_record.net_amount - summary_record.tax_amount, 0);
  journal_lines := jsonb_build_array(
    jsonb_build_object('accountCode', '1000', 'debit', summary_record.net_amount, 'credit', 0, 'memo', summary_record.source || ' ' || summary_record.date::text),
    jsonb_build_object('accountCode', '4000', 'debit', 0, 'credit', revenue_amount, 'memo', summary_record.source || ' ' || summary_record.date::text)
  );

  if summary_record.tax_amount > 0 then
    journal_lines := journal_lines || jsonb_build_array(
      jsonb_build_object('accountCode', '2200', 'debit', 0, 'credit', summary_record.tax_amount, 'memo', 'Pajak transaksi harian')
    );
  end if;

  journal_id := public.create_posted_journal(
    target_business_id,
    summary_record.date,
    'Ringkasan transaksi ' || summary_record.source || ' ' || summary_record.date::text,
    'csv_import',
    summary_record.id,
    role,
    journal_lines
  );

  update public.daily_transaction_summaries
  set status = 'posted', posted_journal_entry_id = journal_id
  where id = summary_record.id;

  update public.raw_transactions
  set status = 'posted'
  where business_id = target_business_id
    and location_id = summary_record.location_id
    and source = summary_record.source
    and transaction_date = summary_record.date
    and status = 'summarized';

  update public.raw_import_batches batch
  set status = 'posted'
  where business_id = target_business_id
    and not exists (
      select 1 from public.raw_transactions tx
      where tx.batch_id = batch.id
        and tx.status not in ('posted', 'duplicate')
    );

  insert into public.activity_events (business_id, actor_user_id, actor_name, module, action, description)
  values (
    target_business_id,
    auth.uid(),
    coalesce(auth.uid()::text, 'System'),
    'accounting',
    'summary posted',
    'Daily summary ' || target_summary_id::text || ' posted to journal ' || journal_id::text || '.'
  );

  return summary_record.id;
end;
$$;

create or replace function public.rollback_daily_summary(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_business_id uuid := (payload->>'businessId')::uuid;
  target_summary_id uuid := (payload->>'summaryId')::uuid;
  summary_record record;
begin
  perform public.require_posting_role(target_business_id, array['owner', 'finance_admin', 'system_admin']);

  select * into summary_record
  from public.daily_transaction_summaries
  where id = target_summary_id and business_id = target_business_id
  for update;

  if summary_record.id is null then
    raise exception 'Daily transaction summary does not exist.';
  end if;

  if summary_record.posted_journal_entry_id is not null then
    update public.journal_entries
    set status = 'reversed'
    where id = summary_record.posted_journal_entry_id
      and business_id = target_business_id;
  end if;

  update public.daily_transaction_summaries
  set status = 'rolled_back', posted_journal_entry_id = null
  where id = target_summary_id;

  update public.raw_transactions
  set status = 'rolled_back'
  where business_id = target_business_id
    and location_id = summary_record.location_id
    and source = summary_record.source
    and transaction_date = summary_record.date
    and status in ('summarized', 'posted');

  update public.raw_import_batches batch
  set status = 'rolled_back'
  where business_id = target_business_id
    and exists (
      select 1 from public.raw_transactions tx
      where tx.batch_id = batch.id
        and tx.location_id = summary_record.location_id
        and tx.source = summary_record.source
        and tx.transaction_date = summary_record.date
    );

  insert into public.activity_events (business_id, actor_user_id, actor_name, module, action, description)
  values (
    target_business_id,
    auth.uid(),
    coalesce(auth.uid()::text, 'System'),
    'accounting',
    'summary rollback',
    'Daily summary ' || target_summary_id::text || ' was rolled back.'
  );

  return target_summary_id;
end;
$$;
