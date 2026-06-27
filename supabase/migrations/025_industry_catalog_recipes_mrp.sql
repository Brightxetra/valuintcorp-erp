-- Industry-aware catalog, recipe/BOM costing, and baseline MRP.
-- This migration is safe to run once from Supabase SQL Editor after deploy.

alter table public.products
  add column if not exists industry_item_type text not null default 'retail_sku'
    check (industry_item_type in ('raw_material', 'semi_finished', 'finished_good', 'menu_item', 'retail_sku', 'service_item', 'package', 'other')),
  add column if not exists fulfillment_method text not null default 'buy_stock'
    check (fulfillment_method in ('buy_stock', 'make_to_stock', 'make_to_order', 'recipe_on_sale', 'non_stock')),
  add column if not exists lead_time_days integer not null default 0 check (lead_time_days >= 0),
  add column if not exists production_lead_time_days integer not null default 0 check (production_lead_time_days >= 0),
  add column if not exists safety_stock numeric(18,4) not null default 0 check (safety_stock >= 0),
  add column if not exists minimum_order_qty numeric(18,4) not null default 0 check (minimum_order_qty >= 0),
  add column if not exists make_or_buy text not null default 'buy' check (make_or_buy in ('buy', 'make', 'both'));

update public.products
set
  industry_item_type = case
    when product_type = 'service' then 'service_item'
    when product_type = 'bundle' then 'package'
    when product_type = 'stock_item' then 'retail_sku'
    else 'other'
  end,
  fulfillment_method = case
    when product_type = 'service' then 'non_stock'
    when product_type = 'bundle' then 'recipe_on_sale'
    when track_stock then 'buy_stock'
    else 'non_stock'
  end,
  make_or_buy = case
    when product_type = 'bundle' then 'make'
    when product_type = 'service' then 'buy'
    else 'buy'
  end
where industry_item_type = 'retail_sku'
  and fulfillment_method = 'buy_stock'
  and make_or_buy = 'buy';

create table if not exists public.product_structures (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  parent_product_id uuid not null references public.products(id) on delete cascade,
  type text not null check (type in ('recipe', 'bom', 'bundle')),
  output_quantity numeric(18,4) not null default 1 check (output_quantity > 0),
  yield_percent numeric(8,4) not null default 100 check (yield_percent > 0 and yield_percent <= 100),
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_structure_lines (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  structure_id uuid not null references public.product_structures(id) on delete cascade,
  component_product_id uuid not null references public.products(id) on delete restrict,
  quantity numeric(18,4) not null check (quantity > 0),
  waste_percent numeric(8,4) not null default 0 check (waste_percent >= 0 and waste_percent <= 100),
  unit_cost_snapshot numeric(18,2) not null default 0 check (unit_cost_snapshot >= 0),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.demand_forecasts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  period_start date not null,
  period_end date not null,
  quantity numeric(18,4) not null check (quantity > 0),
  source text not null default 'manual' check (source in ('manual', 'sales_history', 'import')),
  notes text,
  created_at timestamptz not null default now(),
  check (period_start <= period_end)
);

create table if not exists public.mrp_runs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  period_start date not null,
  period_end date not null,
  status text not null default 'planned' check (status in ('draft', 'planned', 'released')),
  created_by uuid,
  created_at timestamptz not null default now(),
  check (period_start <= period_end)
);

create table if not exists public.mrp_recommendations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  mrp_run_id uuid references public.mrp_runs(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  type text not null check (type in ('purchase', 'production')),
  quantity numeric(18,4) not null check (quantity > 0),
  due_date date not null,
  source_demand text,
  status text not null default 'planned' check (status in ('planned', 'released', 'dismissed')),
  created_at timestamptz not null default now()
);

create table if not exists public.production_orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  order_no text not null,
  product_id uuid not null references public.products(id) on delete restrict,
  warehouse_id uuid references public.warehouses(id) on delete restrict,
  quantity numeric(18,4) not null check (quantity > 0),
  status text not null default 'draft' check (status in ('draft', 'released', 'completed', 'cancelled')),
  planned_date date not null,
  completed_date date,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (business_id, order_no)
);

create table if not exists public.production_order_lines (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  production_order_id uuid not null references public.production_orders(id) on delete cascade,
  component_product_id uuid not null references public.products(id) on delete restrict,
  warehouse_id uuid references public.warehouses(id) on delete restrict,
  planned_quantity numeric(18,4) not null check (planned_quantity > 0),
  consumed_quantity numeric(18,4) not null default 0 check (consumed_quantity >= 0),
  unit_cost_snapshot numeric(18,2) not null default 0 check (unit_cost_snapshot >= 0)
);

create index if not exists idx_products_industry_type on public.products (business_id, industry_item_type);
create index if not exists idx_products_fulfillment on public.products (business_id, fulfillment_method);
create index if not exists idx_product_structures_business_parent on public.product_structures (business_id, parent_product_id);
create unique index if not exists idx_product_structures_one_active
  on public.product_structures (business_id, parent_product_id, type)
  where is_active;
create index if not exists idx_product_structure_lines_structure on public.product_structure_lines (structure_id);
create index if not exists idx_demand_forecasts_business_period on public.demand_forecasts (business_id, period_start, period_end);
create index if not exists idx_mrp_recommendations_run on public.mrp_recommendations (mrp_run_id);
create index if not exists idx_production_orders_business_status on public.production_orders (business_id, status, planned_date);

alter table public.product_structures enable row level security;
alter table public.product_structure_lines enable row level security;
alter table public.demand_forecasts enable row level security;
alter table public.mrp_runs enable row level security;
alter table public.mrp_recommendations enable row level security;
alter table public.production_orders enable row level security;
alter table public.production_order_lines enable row level security;

drop policy if exists "members can read product structures" on public.product_structures;
drop policy if exists "inventory can manage product structures" on public.product_structures;
create policy "members can read product structures" on public.product_structures for select using (app_private.is_business_member(business_id));
create policy "inventory can manage product structures" on public.product_structures for all
using (app_private.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'system_admin']))
with check (app_private.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'system_admin']));

drop policy if exists "members can read product structure lines" on public.product_structure_lines;
drop policy if exists "inventory can manage product structure lines" on public.product_structure_lines;
create policy "members can read product structure lines" on public.product_structure_lines for select using (app_private.is_business_member(business_id));
create policy "inventory can manage product structure lines" on public.product_structure_lines for all
using (app_private.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'system_admin']))
with check (app_private.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'system_admin']));

drop policy if exists "members can read demand forecasts" on public.demand_forecasts;
drop policy if exists "inventory can manage demand forecasts" on public.demand_forecasts;
create policy "members can read demand forecasts" on public.demand_forecasts for select using (app_private.is_business_member(business_id));
create policy "inventory can manage demand forecasts" on public.demand_forecasts for all
using (app_private.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'system_admin']))
with check (app_private.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'system_admin']));

drop policy if exists "members can read mrp runs" on public.mrp_runs;
drop policy if exists "inventory can manage mrp runs" on public.mrp_runs;
create policy "members can read mrp runs" on public.mrp_runs for select using (app_private.is_business_member(business_id));
create policy "inventory can manage mrp runs" on public.mrp_runs for all
using (app_private.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'system_admin']))
with check (app_private.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'system_admin']));

drop policy if exists "members can read mrp recommendations" on public.mrp_recommendations;
drop policy if exists "inventory can manage mrp recommendations" on public.mrp_recommendations;
create policy "members can read mrp recommendations" on public.mrp_recommendations for select using (app_private.is_business_member(business_id));
create policy "inventory can manage mrp recommendations" on public.mrp_recommendations for all
using (app_private.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'system_admin']))
with check (app_private.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'system_admin']));

drop policy if exists "members can read production orders" on public.production_orders;
drop policy if exists "inventory can manage production orders" on public.production_orders;
create policy "members can read production orders" on public.production_orders for select using (app_private.is_business_member(business_id));
create policy "inventory can manage production orders" on public.production_orders for all
using (app_private.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'system_admin']))
with check (app_private.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'system_admin']));

drop policy if exists "members can read production order lines" on public.production_order_lines;
drop policy if exists "inventory can manage production order lines" on public.production_order_lines;
create policy "members can read production order lines" on public.production_order_lines for select using (app_private.is_business_member(business_id));
create policy "inventory can manage production order lines" on public.production_order_lines for all
using (app_private.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'system_admin']))
with check (app_private.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'system_admin']));

grant select, insert, update, delete on public.product_structures to authenticated, service_role;
grant select, insert, update, delete on public.product_structure_lines to authenticated, service_role;
grant select, insert, update, delete on public.demand_forecasts to authenticated, service_role;
grant select, insert, update, delete on public.mrp_runs to authenticated, service_role;
grant select, insert, update, delete on public.mrp_recommendations to authenticated, service_role;
grant select, insert, update, delete on public.production_orders to authenticated, service_role;
grant select, insert, update, delete on public.production_order_lines to authenticated, service_role;

insert into public.industry_templates (id, industry, name, description, enabled_modules, default_product_type)
values
  ('tpl-manufacturing', 'manufacturing', 'Manufaktur', 'BOM, perencanaan kebutuhan material, order produksi, stok, pembelian, dan laporan.', array['dashboard','sales','purchases','inventory','accounting','reports','tax','locations'], 'stock_item'),
  ('tpl-food-beverage-recipe', 'food_beverage', 'F&B resep dan HPP', 'Menu, bahan baku, resep, HPP otomatis, POS cabang, stok, dan rekap keuangan.', array['dashboard','sales','purchases','inventory','accounting','reports','tax','locations'], 'stock_item')
on conflict (id) do update
set
  name = excluded.name,
  description = excluded.description,
  enabled_modules = excluded.enabled_modules,
  default_product_type = excluded.default_product_type;

create or replace function public.product_unit_cost(
  target_business_id uuid,
  target_product_id uuid,
  visited uuid[] default '{}'::uuid[]
)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  product_record record;
  structure_record record;
  line_record record;
  total_cost numeric := 0;
  component_cost numeric := 0;
begin
  select * into product_record
  from public.products
  where id = target_product_id and business_id = target_business_id;

  if product_record.id is null then
    return 0;
  end if;

  if target_product_id = any(visited) then
    return coalesce(product_record.purchase_price, 0);
  end if;

  select * into structure_record
  from public.product_structures
  where business_id = target_business_id
    and parent_product_id = target_product_id
    and is_active = true
  order by updated_at desc
  limit 1;

  if structure_record.id is null then
    return case when product_record.track_stock then coalesce(product_record.purchase_price, 0) else 0 end;
  end if;

  for line_record in
    select * from public.product_structure_lines
    where business_id = target_business_id and structure_id = structure_record.id
  loop
    component_cost := public.product_unit_cost(
      target_business_id,
      line_record.component_product_id,
      visited || target_product_id
    );
    total_cost := total_cost + (line_record.quantity * (1 + line_record.waste_percent / 100) * component_cost);
  end loop;

  return total_cost / greatest(structure_record.output_quantity, 1) / (greatest(structure_record.yield_percent, 1) / 100);
end;
$$;

revoke execute on function public.product_unit_cost(uuid, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.product_unit_cost(uuid, uuid, uuid[]) to service_role;

create or replace function public.post_pos_sale_internal(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  target_business_id uuid := (payload->>'businessId')::uuid;
  target_location_id uuid := (payload->>'locationId')::uuid;
  sale_date date := coalesce(nullif(payload->>'date', '')::date, current_date);
  payment_method_value text := coalesce(nullif(payload->>'paymentMethod', ''), 'cash');
  line_items jsonb := payload->'items';
  line_item jsonb;
  location_record record;
  product_record record;
  structure_record record;
  component_record record;
  structure_line record;
  line_product_id uuid;
  qty numeric;
  unit_price numeric;
  unit_cogs numeric;
  component_required numeric;
  component_unit_cost numeric;
  invoice_id uuid;
  invoice_no text;
  sales_journal_id uuid;
  payment_id uuid;
  payment_no text;
  payment_journal_id uuid;
  member_role text;
  total numeric := 0;
  cogs_total numeric := 0;
begin
  if jsonb_typeof(line_items) <> 'array' or jsonb_array_length(line_items) = 0 then
    raise exception 'At least one POS item is required.';
  end if;

  if payment_method_value not in ('cash', 'bank_transfer', 'qris', 'marketplace', 'other') then
    raise exception 'Unsupported payment method.';
  end if;

  member_role := app_private.require_pos_access(target_business_id, target_location_id, 'pos:sell');

  if public.is_period_locked(target_business_id, sale_date) then
    raise exception 'Period is locked. Use a correction or reversal entry.';
  end if;

  select * into location_record
  from public.locations
  where id = target_location_id
    and business_id = target_business_id
    and is_active = true
    and type in ('branch', 'outlet', 'store');

  if location_record.id is null or location_record.warehouse_id is null then
    raise exception 'An active branch with a warehouse is required for POS.';
  end if;

  for line_item in select * from jsonb_array_elements(line_items)
  loop
    line_product_id := nullif(line_item->>'productId', '')::uuid;
    qty := (line_item->>'quantity')::numeric;
    unit_price := coalesce(nullif(line_item->>'unitPrice', '')::numeric, 0);

    if line_product_id is null or qty is null or qty <= 0 or unit_price < 0 then
      raise exception 'Each POS item requires a product, positive quantity, and valid price.';
    end if;

    perform pg_advisory_xact_lock(hashtext(target_business_id::text || line_product_id::text || location_record.warehouse_id::text));

    select * into product_record
    from public.products
    where id = line_product_id
      and business_id = target_business_id
      and is_active = true
      and is_sellable = true;

    if product_record.id is null then
      raise exception 'Product is not active or sellable.';
    end if;

    select * into structure_record
    from public.product_structures
    where business_id = target_business_id
      and parent_product_id = line_product_id
      and is_active = true
    order by updated_at desc
    limit 1;

    if structure_record.id is not null and product_record.fulfillment_method = 'recipe_on_sale' then
      for structure_line in
        select * from public.product_structure_lines
        where business_id = target_business_id and structure_id = structure_record.id
      loop
        component_required := qty * structure_line.quantity * (1 + structure_line.waste_percent / 100)
          / greatest(structure_record.output_quantity, 1)
          / (greatest(structure_record.yield_percent, 1) / 100);

        select * into component_record
        from public.products
        where id = structure_line.component_product_id
          and business_id = target_business_id;

        if component_record.track_stock
          and public.current_stock_quantity(target_business_id, component_record.id, location_record.warehouse_id) < component_required then
          raise exception 'Insufficient ingredient stock at this branch.';
        end if;
      end loop;
    elsif product_record.track_stock
      and public.current_stock_quantity(target_business_id, line_product_id, location_record.warehouse_id) < qty then
      raise exception 'Insufficient stock at this branch.';
    end if;

    unit_cogs := public.product_unit_cost(target_business_id, line_product_id);
    total := total + (qty * unit_price);
    cogs_total := cogs_total + case when product_record.track_stock or structure_record.id is not null then qty * unit_cogs else 0 end;
  end loop;

  invoice_no := public.next_document_no(target_business_id, 'POS');

  insert into public.sales_invoices (
    business_id, invoice_no, customer_id, date, due_date, status, total, paid_amount,
    location_id, source, created_by
  )
  select
    target_business_id,
    invoice_no,
    customer.id,
    sale_date,
    sale_date,
    'paid',
    total,
    total,
    target_location_id,
    'pos',
    auth.uid()
  from public.customers customer
  where customer.business_id = target_business_id and customer.code = 'POS-UMUM' and customer.is_active = true
  order by customer.created_at
  limit 1
  returning id into invoice_id;

  if invoice_id is null then
    raise exception 'Create one active customer before using POS.';
  end if;

  for line_item in select * from jsonb_array_elements(line_items)
  loop
    line_product_id := (line_item->>'productId')::uuid;
    qty := (line_item->>'quantity')::numeric;
    unit_price := coalesce(nullif(line_item->>'unitPrice', '')::numeric, 0);

    select * into product_record
    from public.products
    where id = line_product_id and business_id = target_business_id;

    unit_cogs := public.product_unit_cost(target_business_id, line_product_id);

    insert into public.sales_invoice_lines (
      business_id, sales_invoice_id, product_id, warehouse_id, description, quantity, unit_price, cogs
    ) values (
      target_business_id, invoice_id, line_product_id, location_record.warehouse_id,
      product_record.name, qty, unit_price, unit_cogs
    );
  end loop;

  sales_journal_id := public.create_posted_journal(
    target_business_id,
    sale_date,
    'Penjualan POS ' || invoice_no,
    'manual_transaction',
    invoice_id,
    member_role,
    jsonb_build_array(
      jsonb_build_object('accountCode', '1100', 'debit', total, 'credit', 0, 'memo', invoice_no),
      jsonb_build_object('accountCode', '4000', 'debit', 0, 'credit', total, 'memo', invoice_no)
    ) || case when cogs_total > 0 then jsonb_build_array(
      jsonb_build_object('accountCode', '5000', 'debit', cogs_total, 'credit', 0, 'memo', invoice_no),
      jsonb_build_object('accountCode', '1200', 'debit', 0, 'credit', cogs_total, 'memo', invoice_no)
    ) else '[]'::jsonb end
  );

  update public.sales_invoices set journal_entry_id = sales_journal_id where id = invoice_id;

  for line_item in select * from jsonb_array_elements(line_items)
  loop
    line_product_id := (line_item->>'productId')::uuid;
    qty := (line_item->>'quantity')::numeric;

    select * into product_record
    from public.products
    where id = line_product_id and business_id = target_business_id;

    select * into structure_record
    from public.product_structures
    where business_id = target_business_id
      and parent_product_id = line_product_id
      and is_active = true
    order by updated_at desc
    limit 1;

    if structure_record.id is not null and product_record.fulfillment_method = 'recipe_on_sale' then
      for structure_line in
        select * from public.product_structure_lines
        where business_id = target_business_id and structure_id = structure_record.id
      loop
        select * into component_record
        from public.products
        where id = structure_line.component_product_id and business_id = target_business_id;

        if component_record.track_stock then
          component_required := qty * structure_line.quantity * (1 + structure_line.waste_percent / 100)
            / greatest(structure_record.output_quantity, 1)
            / (greatest(structure_record.yield_percent, 1) / 100);
          component_unit_cost := public.product_unit_cost(target_business_id, component_record.id);

          insert into public.stock_movements (
            business_id, item_id, warehouse_id, date, type, quantity, value, journal_entry_id, memo
          ) values (
            target_business_id, component_record.id, location_record.warehouse_id, sale_date,
            'sale', component_required, component_required * component_unit_cost, sales_journal_id, invoice_no
          );
        end if;
      end loop;
    elsif product_record.track_stock then
      unit_cogs := public.product_unit_cost(target_business_id, line_product_id);
      insert into public.stock_movements (
        business_id, item_id, warehouse_id, date, type, quantity, value, journal_entry_id, memo
      ) values (
        target_business_id, line_product_id, location_record.warehouse_id, sale_date,
        'sale', qty, qty * unit_cogs, sales_journal_id, invoice_no
      );
    end if;
  end loop;

  payment_no := public.next_document_no(target_business_id, 'RCV');
  insert into public.payments (
    business_id, direction, document_type, document_id, date, amount, method, reference, status, created_by
  ) values (
    target_business_id, 'inbound', 'sales_invoice', invoice_id, sale_date, total,
    payment_method_value, payment_no, 'posted', auth.uid()
  ) returning id into payment_id;

  payment_journal_id := public.create_posted_journal(
    target_business_id,
    sale_date,
    'Penerimaan POS ' || payment_no,
    'manual_transaction',
    payment_id,
    member_role,
    jsonb_build_array(
      jsonb_build_object('accountCode', '1000', 'debit', total, 'credit', 0, 'memo', payment_no),
      jsonb_build_object('accountCode', '1100', 'debit', 0, 'credit', total, 'memo', payment_no)
    )
  );

  update public.payments set journal_entry_id = payment_journal_id where id = payment_id;
  insert into public.payment_allocations (business_id, payment_id, document_type, document_id, amount)
  values (target_business_id, payment_id, 'sales_invoice', invoice_id, total);

  insert into public.activity_events (business_id, actor_user_id, actor_name, module, action, description)
  values (target_business_id, auth.uid(), coalesce(auth.uid()::text, 'Kasir'), 'sales', 'posted POS sale', invoice_no || ' dipost dari cabang.');

  return invoice_id;
end;
$$;

revoke execute on function public.post_pos_sale_internal(jsonb) from public, anon, authenticated;
grant execute on function public.post_pos_sale_internal(jsonb) to service_role;
