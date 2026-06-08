alter table public.sales_invoice_lines
  add column if not exists warehouse_id uuid references public.warehouses(id);

alter table public.purchase_bill_lines
  add column if not exists warehouse_id uuid references public.warehouses(id);

do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.stock_movements'::regclass
    and confrelid = 'public.inventory_items'::regclass
    and contype = 'f'
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.stock_movements drop constraint %I', constraint_name);
  end if;
end $$;

insert into public.products (
  id,
  business_id,
  sku,
  name,
  variant,
  category,
  unit,
  track_stock,
  default_warehouse_id,
  selling_price,
  purchase_price,
  reorder_point,
  is_sellable,
  is_purchasable,
  is_active
)
select
  item.id,
  item.business_id,
  item.sku,
  item.name,
  item.variant,
  'Umum',
  item.unit,
  item.track_stock,
  item.default_warehouse_id,
  0,
  0,
  0,
  true,
  true,
  true
from public.inventory_items item
where not exists (
  select 1 from public.products product
  where product.business_id = item.business_id
    and product.sku = item.sku
);

update public.stock_movements movement
set item_id = product.id
from public.inventory_items item
join public.products product
  on product.business_id = item.business_id
 and product.sku = item.sku
where movement.item_id = item.id
  and movement.business_id = item.business_id;

alter table public.stock_movements
  add constraint stock_movements_item_id_products_fkey
  foreign key (item_id) references public.products(id);

create table if not exists public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  payment_id uuid not null references public.payments(id) on delete cascade,
  document_type text not null check (document_type in ('sales_invoice', 'purchase_bill', 'payroll_run')),
  document_id uuid not null,
  amount numeric(18, 2) not null check (amount > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.document_sequences (
  business_id uuid not null references public.businesses(id) on delete cascade,
  sequence_key text not null,
  next_value bigint not null default 1 check (next_value > 0),
  updated_at timestamptz not null default now(),
  primary key (business_id, sequence_key)
);

alter table public.payment_allocations enable row level security;
alter table public.document_sequences enable row level security;

drop policy if exists "members can read payment allocations" on public.payment_allocations;
create policy "members can read payment allocations"
on public.payment_allocations for select
using (public.is_business_member(business_id));

drop policy if exists "finance can manage payment allocations" on public.payment_allocations;
create policy "finance can manage payment allocations"
on public.payment_allocations for all
using (public.has_business_role(business_id, array['owner', 'finance_admin', 'system_admin']))
with check (public.has_business_role(business_id, array['owner', 'finance_admin', 'system_admin']));

drop policy if exists "members can read document sequences" on public.document_sequences;
create policy "members can read document sequences"
on public.document_sequences for select
using (public.is_business_member(business_id));

drop policy if exists "system can manage document sequences" on public.document_sequences;
create policy "system can manage document sequences"
on public.document_sequences for all
using (public.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'hr', 'system_admin']))
with check (public.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'hr', 'system_admin']));

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'customers',
    'suppliers',
    'products',
    'sales_invoices',
    'purchase_bills',
    'tax_profiles',
    'document_sequences'
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

create index if not exists customers_business_name_idx on public.customers (business_id, lower(name));
create index if not exists suppliers_business_name_idx on public.suppliers (business_id, lower(name));
create index if not exists products_business_sku_idx on public.products (business_id, sku);
create index if not exists sales_invoices_business_status_date_idx on public.sales_invoices (business_id, status, date desc);
create index if not exists sales_invoices_business_customer_idx on public.sales_invoices (business_id, customer_id);
create index if not exists purchase_bills_business_status_date_idx on public.purchase_bills (business_id, status, date desc);
create index if not exists purchase_bills_business_supplier_idx on public.purchase_bills (business_id, supplier_id);
create index if not exists payments_business_document_idx on public.payments (business_id, document_type, document_id);
create index if not exists payment_allocations_business_document_idx on public.payment_allocations (business_id, document_type, document_id);
create index if not exists stock_movements_business_item_warehouse_date_idx on public.stock_movements (business_id, item_id, warehouse_id, date);
create index if not exists journal_entries_business_date_idx on public.journal_entries (business_id, date desc);
create index if not exists activity_events_business_created_idx on public.activity_events (business_id, created_at desc);

create or replace function public.ensure_stock_movement_consistency()
returns trigger
language plpgsql
as $$
declare
  item_business uuid;
  warehouse_business uuid;
begin
  select business_id into item_business from public.products where id = new.item_id;
  select business_id into warehouse_business from public.warehouses where id = new.warehouse_id;

  if item_business <> new.business_id or warehouse_business <> new.business_id then
    raise exception 'Stock movement item and warehouse must belong to the same business.';
  end if;

  if public.is_period_locked(new.business_id, new.date) then
    raise exception 'Period is locked. Use a correction or reversal entry.';
  end if;

  return new;
end;
$$;

create or replace function public.next_document_no(target_business_id uuid, document_prefix text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  sequence_key text;
  current_value bigint;
begin
  sequence_key := document_prefix || '-' || to_char(now(), 'YYYY');

  insert into public.document_sequences (business_id, sequence_key, next_value)
  values (target_business_id, sequence_key, 2)
  on conflict (business_id, sequence_key)
  do update set next_value = public.document_sequences.next_value + 1
  returning next_value - 1 into current_value;

  return sequence_key || '-' || lpad(current_value::text, 4, '0');
end;
$$;

create or replace function public.require_posting_role(target_business_id uuid, allowed_roles text[])
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  role text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  role := public.member_role(target_business_id);

  if role is null or not (role = any(allowed_roles)) then
    raise exception 'User is not allowed to post this document.';
  end if;

  return role;
end;
$$;

create or replace function public.account_id_for_code(target_business_id uuid, account_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_account_id uuid;
begin
  select id into target_account_id
  from public.chart_of_accounts
  where business_id = target_business_id
    and code = account_code
    and is_active = true
  limit 1;

  if target_account_id is null then
    raise exception 'Account code % is not configured for business %.', account_code, target_business_id;
  end if;

  return target_account_id;
end;
$$;

create or replace function public.create_posted_journal(
  target_business_id uuid,
  journal_date date,
  journal_description text,
  journal_source text,
  journal_reference_id uuid,
  created_role text,
  lines jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  entry_id uuid;
  line jsonb;
begin
  insert into public.journal_entries (
    business_id,
    date,
    period,
    description,
    source,
    status,
    reference_id,
    created_by,
    created_by_role
  )
  values (
    target_business_id,
    journal_date,
    to_char(journal_date, 'YYYY-MM'),
    journal_description,
    journal_source,
    'posted',
    journal_reference_id,
    auth.uid(),
    created_role
  )
  returning id into entry_id;

  for line in select * from jsonb_array_elements(lines)
  loop
    insert into public.journal_lines (
      business_id,
      journal_entry_id,
      account_id,
      debit,
      credit,
      memo
    )
    values (
      target_business_id,
      entry_id,
      public.account_id_for_code(target_business_id, line->>'accountCode'),
      coalesce((line->>'debit')::numeric, 0),
      coalesce((line->>'credit')::numeric, 0),
      line->>'memo'
    );
  end loop;

  return entry_id;
end;
$$;

create or replace function public.current_stock_quantity(
  target_business_id uuid,
  target_item_id uuid,
  target_warehouse_id uuid
)
returns numeric
language sql
stable
as $$
  select coalesce(sum(
    case
      when type in ('purchase', 'transfer_in', 'adjustment_in') then quantity
      else -quantity
    end
  ), 0)
  from public.stock_movements
  where business_id = target_business_id
    and item_id = target_item_id
    and warehouse_id = target_warehouse_id;
$$;

create or replace function public.document_status(total_amount numeric, paid_amount numeric)
returns text
language sql
immutable
as $$
  select case
    when paid_amount <= 0 then 'posted'
    when paid_amount < total_amount then 'partially_paid'
    else 'paid'
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
  target_product_id uuid := (payload->>'productId')::uuid;
  target_warehouse_id uuid := nullif(payload->>'warehouseId', '')::uuid;
  invoice_date date := (payload->>'date')::date;
  invoice_due_date date := (payload->>'dueDate')::date;
  qty numeric := (payload->>'quantity')::numeric;
  unit_price numeric := (payload->>'unitPrice')::numeric;
  product_record record;
  customer_record record;
  invoice_id uuid;
  invoice_no text;
  journal_id uuid;
  role text;
  total numeric;
  cogs_total numeric;
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

  select * into product_record
  from public.products
  where id = target_product_id and business_id = target_business_id and is_active = true and is_sellable = true;

  if product_record.id is null then
    raise exception 'Product is not active or sellable.';
  end if;

  select * into customer_record
  from public.customers
  where id = target_customer_id and business_id = target_business_id and is_active = true;

  if customer_record.id is null then
    raise exception 'Customer is not active.';
  end if;

  target_warehouse_id := coalesce(target_warehouse_id, product_record.default_warehouse_id);

  if target_warehouse_id is null then
    raise exception 'Warehouse is required.';
  end if;

  total := qty * unit_price;
  cogs_total := case when product_record.track_stock then qty * product_record.purchase_price else 0 end;

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

  if product_record.track_stock and public.current_stock_quantity(target_business_id, target_product_id, target_warehouse_id) < qty then
    raise exception 'Posting this invoice would create negative stock.';
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
    target_product_id,
    target_warehouse_id,
    product_record.name,
    qty,
    unit_price,
    product_record.purchase_price
  );

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

  if product_record.track_stock and cogs_total > 0 then
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
      target_product_id,
      target_warehouse_id,
      invoice_date,
      'sale',
      qty,
      cogs_total,
      journal_id,
      invoice_no
    );
  end if;

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
  target_product_id uuid := (payload->>'productId')::uuid;
  target_warehouse_id uuid := nullif(payload->>'warehouseId', '')::uuid;
  bill_date date := (payload->>'date')::date;
  bill_due_date date := (payload->>'dueDate')::date;
  qty numeric := (payload->>'quantity')::numeric;
  unit_cost numeric := (payload->>'unitCost')::numeric;
  product_record record;
  bill_id uuid;
  bill_no text;
  journal_id uuid;
  role text;
  total numeric;
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

  select * into product_record
  from public.products
  where id = target_product_id and business_id = target_business_id and is_active = true and is_purchasable = true;

  if product_record.id is null then
    raise exception 'Product is not active or purchasable.';
  end if;

  target_warehouse_id := coalesce(target_warehouse_id, product_record.default_warehouse_id);

  if target_warehouse_id is null then
    raise exception 'Warehouse is required.';
  end if;

  total := qty * unit_cost;
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
    target_product_id,
    target_warehouse_id,
    product_record.name,
    qty,
    unit_cost
  );

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
      target_product_id,
      target_warehouse_id,
      bill_date,
      'purchase',
      qty,
      total,
      journal_id,
      bill_no
    );
  end if;

  insert into public.activity_events (business_id, actor_user_id, actor_name, module, action, description)
  values (target_business_id, auth.uid(), coalesce(auth.uid()::text, 'System'), 'purchases', 'posted bill', bill_no || ' dipost atomik.');

  return bill_id;
end;
$$;

create or replace function public.post_payment(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_business_id uuid := (payload->>'businessId')::uuid;
  doc_type text := payload->>'documentType';
  doc_id uuid := (payload->>'documentId')::uuid;
  direction_value text := payload->>'direction';
  payment_date date := (payload->>'date')::date;
  payment_amount numeric := (payload->>'amount')::numeric;
  payment_method text := payload->>'method';
  reference_no text;
  payment_id uuid;
  journal_id uuid;
  role text;
  outstanding_amount numeric;
  total_amount numeric;
  paid_amount numeric;
  debit_account text;
  credit_account text;
  module_name text;
begin
  role := public.require_posting_role(target_business_id, array['owner', 'finance_admin', 'system_admin']);

  if public.is_period_locked(target_business_id, payment_date) then
    raise exception 'Period is locked. Use a correction or reversal entry.';
  end if;

  if doc_type = 'sales_invoice' and direction_value <> 'inbound' then
    raise exception 'Sales invoice payments must be inbound.';
  end if;

  if doc_type in ('purchase_bill', 'payroll_run') and direction_value <> 'outbound' then
    raise exception 'Purchase and payroll payments must be outbound.';
  end if;

  if doc_type = 'sales_invoice' then
    select total, paid_amount into total_amount, paid_amount
    from public.sales_invoices
    where id = doc_id and business_id = target_business_id and status not in ('draft', 'void');
    debit_account := '1000';
    credit_account := '1100';
    module_name := 'sales';
  elsif doc_type = 'purchase_bill' then
    select total, paid_amount into total_amount, paid_amount
    from public.purchase_bills
    where id = doc_id and business_id = target_business_id and status not in ('draft', 'void');
    debit_account := '2000';
    credit_account := '1000';
    module_name := 'purchases';
  elsif doc_type = 'payroll_run' then
    select gross_pay, net_pay into total_amount, paid_amount
    from public.payroll_runs
    where id = doc_id and business_id = target_business_id;
    debit_account := '2100';
    credit_account := '1000';
    module_name := 'hr';
  else
    raise exception 'Unsupported document type.';
  end if;

  if total_amount is null then
    raise exception 'Document was not found or cannot be paid.';
  end if;

  outstanding_amount := total_amount - paid_amount;

  if payment_amount > outstanding_amount then
    raise exception 'Payment exceeds outstanding amount.';
  end if;

  reference_no := public.next_document_no(target_business_id, case when direction_value = 'inbound' then 'RCV' else 'PAY' end);

  insert into public.payments (
    business_id,
    direction,
    document_type,
    document_id,
    date,
    amount,
    method,
    reference,
    status,
    created_by
  )
  values (
    target_business_id,
    direction_value,
    doc_type,
    doc_id,
    payment_date,
    payment_amount,
    payment_method,
    reference_no,
    'posted',
    auth.uid()
  )
  returning id into payment_id;

  journal_id := public.create_posted_journal(
    target_business_id,
    payment_date,
    case when direction_value = 'inbound' then 'Penerimaan ' else 'Pembayaran ' end || reference_no,
    'manual_transaction',
    payment_id,
    role,
    jsonb_build_array(
      jsonb_build_object('accountCode', debit_account, 'debit', payment_amount, 'credit', 0, 'memo', reference_no),
      jsonb_build_object('accountCode', credit_account, 'debit', 0, 'credit', payment_amount, 'memo', reference_no)
    )
  );

  update public.payments set journal_entry_id = journal_id where id = payment_id;

  insert into public.payment_allocations (business_id, payment_id, document_type, document_id, amount)
  values (target_business_id, payment_id, doc_type, doc_id, payment_amount);

  if doc_type = 'sales_invoice' then
    update public.sales_invoices
    set paid_amount = paid_amount + payment_amount,
        status = public.document_status(total, paid_amount + payment_amount)
    where id = doc_id;
  elsif doc_type = 'purchase_bill' then
    update public.purchase_bills
    set paid_amount = paid_amount + payment_amount,
        status = public.document_status(total, paid_amount + payment_amount)
    where id = doc_id;
  end if;

  insert into public.activity_events (business_id, actor_user_id, actor_name, module, action, description)
  values (target_business_id, auth.uid(), coalesce(auth.uid()::text, 'System'), module_name, 'posted payment', reference_no || ' dipost atomik.');

  return payment_id;
end;
$$;

create or replace function public.post_stock_adjustment(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_business_id uuid := (payload->>'businessId')::uuid;
  target_item_id uuid := (payload->>'itemId')::uuid;
  target_warehouse_id uuid := (payload->>'warehouseId')::uuid;
  adjustment_date date := (payload->>'date')::date;
  qty numeric := (payload->>'quantity')::numeric;
  adjustment_value numeric := (payload->>'value')::numeric;
  reason_text text := payload->>'reason';
  adjustment_id uuid;
  adjustment_no text;
  journal_id uuid;
  role text;
  movement_type text;
  journal_lines jsonb;
begin
  role := public.require_posting_role(target_business_id, array['owner', 'finance_admin', 'staff', 'system_admin']);

  if public.is_period_locked(target_business_id, adjustment_date) then
    raise exception 'Period is locked. Use a correction or reversal entry.';
  end if;

  if qty = 0 then
    raise exception 'Quantity cannot be zero.';
  end if;

  if adjustment_value <= 0 then
    raise exception 'Adjustment value must be positive.';
  end if;

  if not exists (
    select 1 from public.products
    where id = target_item_id and business_id = target_business_id and track_stock = true and is_active = true
  ) then
    raise exception 'Stock product is not active.';
  end if;

  if not exists (
    select 1 from public.warehouses
    where id = target_warehouse_id and business_id = target_business_id and is_active = true
  ) then
    raise exception 'Warehouse is not active.';
  end if;

  if qty < 0 and public.current_stock_quantity(target_business_id, target_item_id, target_warehouse_id) < abs(qty) then
    raise exception 'Adjustment would create negative stock.';
  end if;

  adjustment_no := public.next_document_no(target_business_id, 'ADJ');
  movement_type := case when qty > 0 then 'adjustment_in' else 'adjustment_out' end;

  insert into public.stock_adjustments (
    business_id,
    adjustment_no,
    date,
    item_id,
    warehouse_id,
    quantity,
    value,
    reason,
    status,
    created_by
  )
  values (
    target_business_id,
    adjustment_no,
    adjustment_date,
    target_item_id,
    target_warehouse_id,
    qty,
    adjustment_value,
    reason_text,
    'posted',
    auth.uid()
  )
  returning id into adjustment_id;

  journal_lines := case
    when qty > 0 then jsonb_build_array(
      jsonb_build_object('accountCode', '1200', 'debit', adjustment_value, 'credit', 0, 'memo', adjustment_no),
      jsonb_build_object('accountCode', '6000', 'debit', 0, 'credit', adjustment_value, 'memo', adjustment_no)
    )
    else jsonb_build_array(
      jsonb_build_object('accountCode', '6000', 'debit', adjustment_value, 'credit', 0, 'memo', adjustment_no),
      jsonb_build_object('accountCode', '1200', 'debit', 0, 'credit', adjustment_value, 'memo', adjustment_no)
    )
  end;

  journal_id := public.create_posted_journal(
    target_business_id,
    adjustment_date,
    'Stock adjustment ' || adjustment_no,
    'inventory',
    adjustment_id,
    role,
    journal_lines
  );

  update public.stock_adjustments set journal_entry_id = journal_id where id = adjustment_id;

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
    target_item_id,
    target_warehouse_id,
    adjustment_date,
    movement_type,
    abs(qty),
    adjustment_value,
    journal_id,
    reason_text
  );

  insert into public.activity_events (business_id, actor_user_id, actor_name, module, action, description)
  values (target_business_id, auth.uid(), coalesce(auth.uid()::text, 'System'), 'inventory', 'stock adjustment', adjustment_no || ' dipost atomik.');

  return adjustment_id;
end;
$$;

create or replace function public.run_payroll(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_business_id uuid := (payload->>'businessId')::uuid;
  target_employee_id uuid := (payload->>'employeeId')::uuid;
  payroll_date date := (payload->>'date')::date;
  gross_pay numeric := (payload->>'grossPay')::numeric;
  net_cash_paid numeric := (payload->>'netCashPaid')::numeric;
  tax_withheld numeric := (payload->>'taxWithheld')::numeric;
  salary_payable numeric;
  payroll_id uuid;
  journal_id uuid;
  role text;
  journal_lines jsonb;
begin
  role := public.require_posting_role(target_business_id, array['owner', 'hr', 'system_admin']);

  if public.is_period_locked(target_business_id, payroll_date) then
    raise exception 'Period is locked. Use a correction or reversal entry.';
  end if;

  if not exists (
    select 1 from public.employees
    where id = target_employee_id and business_id = target_business_id and status <> 'inactive'
  ) then
    raise exception 'Employee is not active.';
  end if;

  salary_payable := gross_pay - net_cash_paid - tax_withheld;

  if salary_payable < 0 then
    raise exception 'Payroll credits must not exceed gross pay.';
  end if;

  journal_lines := jsonb_build_array(
    jsonb_build_object('accountCode', '5200', 'debit', gross_pay, 'credit', 0, 'memo', 'Payroll')
  );

  if net_cash_paid > 0 then
    journal_lines := journal_lines || jsonb_build_array(
      jsonb_build_object('accountCode', '1000', 'debit', 0, 'credit', net_cash_paid, 'memo', 'Gaji dibayar')
    );
  end if;

  if tax_withheld > 0 then
    journal_lines := journal_lines || jsonb_build_array(
      jsonb_build_object('accountCode', '2200', 'debit', 0, 'credit', tax_withheld, 'memo', 'PPh dipotong')
    );
  end if;

  if salary_payable > 0 then
    journal_lines := journal_lines || jsonb_build_array(
      jsonb_build_object('accountCode', '2100', 'debit', 0, 'credit', salary_payable, 'memo', 'Utang gaji')
    );
  end if;

  journal_id := public.create_posted_journal(
    target_business_id,
    payroll_date,
    'Payroll run',
    'payroll',
    null,
    role,
    journal_lines
  );

  insert into public.payroll_runs (
    business_id,
    period,
    employee_id,
    gross_pay,
    deductions,
    tax_withheld,
    net_pay,
    components,
    journal_entry_id
  )
  values (
    target_business_id,
    to_char(payroll_date, 'YYYY-MM'),
    target_employee_id,
    gross_pay,
    0,
    tax_withheld,
    net_cash_paid,
    jsonb_build_array(jsonb_build_object('name', 'Gaji pokok', 'amount', gross_pay, 'type', 'earning')),
    journal_id
  )
  returning id into payroll_id;

  update public.journal_entries set reference_id = payroll_id where id = journal_id;

  insert into public.activity_events (business_id, actor_user_id, actor_name, module, action, description)
  values (target_business_id, auth.uid(), coalesce(auth.uid()::text, 'System'), 'hr', 'payroll run', 'Payroll run dipost atomik.');

  return payroll_id;
end;
$$;
