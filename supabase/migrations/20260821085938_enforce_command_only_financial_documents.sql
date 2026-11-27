begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
begin
  if current_user <> 'postgres' then
    raise exception 'Financial document command-only migrations must run as the postgres role.';
  end if;
end;
$$;

-- Browsers may read these tables through their RLS projection, but they must
-- never create, rewrite, or erase posted financial history through PostgREST.
revoke all privileges on table
  public.branch_expenses,
  public.payments,
  public.payment_allocations,
  public.purchase_bills,
  public.purchase_bill_lines,
  public.sales_invoices,
  public.sales_invoice_lines,
  public.journal_entries,
  public.journal_lines
from public, anon, authenticated;

grant select on table
  public.branch_expenses,
  public.payments,
  public.payment_allocations,
  public.purchase_bills,
  public.purchase_bill_lines,
  public.sales_invoices,
  public.sales_invoice_lines,
  public.journal_entries,
  public.journal_lines
to authenticated;

-- Remove every historical write policy, including legacy FOR ALL policies and
-- the later INSERT/UPDATE/DELETE policy split. SELECT policies are deliberately
-- retained for the separate sensitive-read hardening batch.
do $$
declare
  policy_record record;
begin
  for policy_record in
    select
      namespace.nspname as schema_name,
      relation.relname as table_name,
      policy.polname as policy_name
    from pg_catalog.pg_policy policy
    join pg_catalog.pg_class relation on relation.oid = policy.polrelid
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = any(array[
        'branch_expenses',
        'payments',
        'payment_allocations',
        'purchase_bills',
        'purchase_bill_lines',
        'sales_invoices',
        'sales_invoice_lines',
        'journal_entries',
        'journal_lines'
      ])
      and policy.polcmd <> 'r'
  loop
    execute pg_catalog.format(
      'drop policy %I on %I.%I',
      policy_record.policy_name,
      policy_record.schema_name,
      policy_record.table_name
    );
  end loop;
end;
$$;

-- These legacy posting routines were previously unreachable in the database
-- rehearsal because PL/pgSQL could not distinguish local variables from the
-- identically named financial columns. Qualify the column side explicitly so
-- the supported commands remain executable after the direct-DML path closes.
create or replace function public.post_sales_invoice_internal(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
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
  role := public.require_posting_role(
    target_business_id,
    array['owner', 'finance_admin', 'staff', 'system_admin']
  );

  if public.is_period_locked(target_business_id, invoice_date) then
    raise exception 'Period is locked. Use a correction or reversal entry.';
  end if;

  if invoice_due_date < invoice_date then
    raise exception 'Due date cannot be earlier than invoice date.';
  end if;

  select * into customer_record
  from public.customers
  where id = target_customer_id
    and business_id = target_business_id
    and is_active = true;

  if customer_record.id is null then
    raise exception 'Customer is not active.';
  end if;

  line_items := case
    when pg_catalog.jsonb_typeof(payload->'items') = 'array' then payload->'items'
    else pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'productId', payload->>'productId',
      'warehouseId', payload->>'warehouseId',
      'quantity', payload->>'quantity',
      'unitPrice', payload->>'unitPrice'
    ))
  end;

  for line_item in
    select * from pg_catalog.jsonb_array_elements(line_items)
  loop
    line_product_id := (line_item->>'productId')::uuid;
    line_warehouse_id := nullif(line_item->>'warehouseId', '')::uuid;
    qty := (line_item->>'quantity')::numeric;
    unit_price := (line_item->>'unitPrice')::numeric;

    select * into product_record
    from public.products
    where id = line_product_id
      and business_id = target_business_id
      and is_active = true
      and is_sellable = true;

    if product_record.id is null then
      raise exception 'Product is not active or sellable.';
    end if;

    line_warehouse_id := coalesce(
      line_warehouse_id,
      product_record.default_warehouse_id
    );

    if line_warehouse_id is null then
      raise exception 'Warehouse is required.';
    end if;

    if not exists (
      select 1
      from public.warehouses
      where id = line_warehouse_id
        and business_id = target_business_id
        and is_active = true
    ) then
      raise exception 'Warehouse is not active.';
    end if;

    if product_record.track_stock
      and public.current_stock_quantity(
        target_business_id,
        line_product_id,
        line_warehouse_id
      ) < qty
    then
      raise exception 'Posting this invoice would create negative stock.';
    end if;

    total := total + (qty * unit_price);
    cogs_total := cogs_total + case
      when product_record.track_stock then qty * product_record.purchase_price
      else 0
    end;
  end loop;

  select coalesce(
    pg_catalog.sum(invoice.total - invoice.paid_amount),
    0
  )
  into customer_open
  from public.sales_invoices invoice
  where invoice.business_id = target_business_id
    and invoice.customer_id = target_customer_id
    and invoice.status not in ('void', 'paid');

  if customer_record.credit_limit = 0 then
    raise exception 'Customer has no credit limit for open AR.';
  end if;

  if customer_record.credit_limit > 0
    and customer_open + total > customer_record.credit_limit
  then
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

  for line_item in
    select * from pg_catalog.jsonb_array_elements(line_items)
  loop
    line_product_id := (line_item->>'productId')::uuid;
    line_warehouse_id := nullif(line_item->>'warehouseId', '')::uuid;
    qty := (line_item->>'quantity')::numeric;
    unit_price := (line_item->>'unitPrice')::numeric;

    select * into product_record
    from public.products
    where id = line_product_id
      and business_id = target_business_id
      and is_active = true
      and is_sellable = true;

    line_warehouse_id := coalesce(
      line_warehouse_id,
      product_record.default_warehouse_id
    );

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

  journal_lines := pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'accountCode', '1100', 'debit', total, 'credit', 0, 'memo', invoice_no
    ),
    pg_catalog.jsonb_build_object(
      'accountCode', '4000', 'debit', 0, 'credit', total, 'memo', invoice_no
    )
  );

  if cogs_total > 0 then
    journal_lines := journal_lines || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'accountCode', '5000', 'debit', cogs_total, 'credit', 0, 'memo', invoice_no
      ),
      pg_catalog.jsonb_build_object(
        'accountCode', '1200', 'debit', 0, 'credit', cogs_total, 'memo', invoice_no
      )
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

  update public.sales_invoices
  set journal_entry_id = journal_id
  where id = invoice_id;

  for line_item in
    select * from pg_catalog.jsonb_array_elements(line_items)
  loop
    line_product_id := (line_item->>'productId')::uuid;
    line_warehouse_id := nullif(line_item->>'warehouseId', '')::uuid;
    qty := (line_item->>'quantity')::numeric;

    select * into product_record
    from public.products
    where id = line_product_id
      and business_id = target_business_id
      and is_active = true
      and is_sellable = true;

    line_warehouse_id := coalesce(
      line_warehouse_id,
      product_record.default_warehouse_id
    );

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

  insert into public.activity_events (
    business_id,
    actor_user_id,
    actor_name,
    module,
    action,
    description
  )
  values (
    target_business_id,
    auth.uid(),
    coalesce(auth.uid()::text, 'System'),
    'sales',
    'posted invoice',
    invoice_no || ' dipost atomik.'
  );

  return invoice_id;
end;
$$;

create or replace function public.post_payment_internal(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
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
  role := public.require_posting_role(
    target_business_id,
    array['owner', 'finance_admin', 'system_admin']
  );

  if public.is_period_locked(target_business_id, payment_date) then
    raise exception 'Period is locked. Use a correction or reversal entry.';
  end if;

  if doc_type = 'sales_invoice' and direction_value <> 'inbound' then
    raise exception 'Sales invoice payments must be inbound.';
  end if;

  if doc_type in ('purchase_bill', 'payroll_run')
    and direction_value <> 'outbound'
  then
    raise exception 'Purchase and payroll payments must be outbound.';
  end if;

  if doc_type = 'sales_invoice' then
    select invoice.total, invoice.paid_amount
    into total_amount, paid_amount
    from public.sales_invoices invoice
    where invoice.id = doc_id
      and invoice.business_id = target_business_id
      and invoice.status not in ('draft', 'void');
    debit_account := '1000';
    credit_account := '1100';
    module_name := 'sales';
  elsif doc_type = 'purchase_bill' then
    select bill.total, bill.paid_amount
    into total_amount, paid_amount
    from public.purchase_bills bill
    where bill.id = doc_id
      and bill.business_id = target_business_id
      and bill.status not in ('draft', 'void');
    debit_account := '2000';
    credit_account := '1000';
    module_name := 'purchases';
  elsif doc_type = 'payroll_run' then
    select payroll.gross_pay, payroll.net_pay
    into total_amount, paid_amount
    from public.payroll_runs payroll
    where payroll.id = doc_id
      and payroll.business_id = target_business_id;
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

  reference_no := public.next_document_no(
    target_business_id,
    case when direction_value = 'inbound' then 'RCV' else 'PAY' end
  );

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
    case
      when direction_value = 'inbound' then 'Penerimaan '
      else 'Pembayaran '
    end || reference_no,
    'manual_transaction',
    payment_id,
    role,
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'accountCode', debit_account,
        'debit', payment_amount,
        'credit', 0,
        'memo', reference_no
      ),
      pg_catalog.jsonb_build_object(
        'accountCode', credit_account,
        'debit', 0,
        'credit', payment_amount,
        'memo', reference_no
      )
    )
  );

  update public.payments
  set journal_entry_id = journal_id
  where id = payment_id;

  insert into public.payment_allocations (
    business_id,
    payment_id,
    document_type,
    document_id,
    amount
  )
  values (
    target_business_id,
    payment_id,
    doc_type,
    doc_id,
    payment_amount
  );

  if doc_type = 'sales_invoice' then
    update public.sales_invoices as invoice
    set
      paid_amount = invoice.paid_amount + payment_amount,
      status = public.document_status(
        invoice.total,
        invoice.paid_amount + payment_amount
      )
    where invoice.id = doc_id;
  elsif doc_type = 'purchase_bill' then
    update public.purchase_bills as bill
    set
      paid_amount = bill.paid_amount + payment_amount,
      status = public.document_status(
        bill.total,
        bill.paid_amount + payment_amount
      )
    where bill.id = doc_id;
  end if;

  insert into public.activity_events (
    business_id,
    actor_user_id,
    actor_name,
    module,
    action,
    description
  )
  values (
    target_business_id,
    auth.uid(),
    coalesce(auth.uid()::text, 'System'),
    module_name,
    'posted payment',
    reference_no || ' dipost atomik.'
  );

  return payment_id;
end;
$$;

-- Rebind accounting commands to the real request actor and require the same
-- effective permission enforced by the application route. Nominal role alone
-- is not enough when a member has a custom permission set.
create or replace function public.post_payment(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  trusted_payload jsonb := payload - 'actorUserId';
  target_business_id uuid := nullif(trusted_payload->>'businessId', '')::uuid;
begin
  perform app_private.apply_request_actor(
    nullif(payload->>'actorUserId', '')::uuid
  );

  if target_business_id is null
    or not app_private.member_has_permission(target_business_id, 'accounting:write')
  then
    raise exception 'Actor lacks accounting:write permission for this business.'
      using errcode = '42501';
  end if;

  return public.post_payment_internal(trusted_payload);
end;
$$;

create or replace function public.post_purchase_bill(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  trusted_payload jsonb := payload - 'actorUserId';
  target_business_id uuid := nullif(trusted_payload->>'businessId', '')::uuid;
begin
  perform app_private.apply_request_actor(
    nullif(payload->>'actorUserId', '')::uuid
  );

  if target_business_id is null
    or not app_private.member_has_permission(target_business_id, 'accounting:write')
  then
    raise exception 'Actor lacks accounting:write permission for this business.'
      using errcode = '42501';
  end if;

  return public.post_purchase_bill_internal(trusted_payload);
end;
$$;

create or replace function public.post_sales_invoice(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  trusted_payload jsonb := payload - 'actorUserId';
  target_business_id uuid := nullif(trusted_payload->>'businessId', '')::uuid;
begin
  perform app_private.apply_request_actor(
    nullif(payload->>'actorUserId', '')::uuid
  );

  if target_business_id is null
    or not app_private.member_has_permission(target_business_id, 'accounting:write')
  then
    raise exception 'Actor lacks accounting:write permission for this business.'
      using errcode = '42501';
  end if;

  return public.post_sales_invoice_internal(trusted_payload);
end;
$$;

create or replace function public.void_document(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  trusted_payload jsonb := payload - 'actorUserId';
  target_business_id uuid := nullif(trusted_payload->>'businessId', '')::uuid;
begin
  perform app_private.apply_request_actor(
    nullif(payload->>'actorUserId', '')::uuid
  );

  if target_business_id is null
    or not app_private.member_has_permission(target_business_id, 'accounting:write')
  then
    raise exception 'Actor lacks accounting:write permission for this business.'
      using errcode = '42501';
  end if;

  return public.void_document_internal(trusted_payload);
end;
$$;

alter function public.post_payment(jsonb) owner to postgres;
alter function public.post_purchase_bill(jsonb) owner to postgres;
alter function public.post_sales_invoice(jsonb) owner to postgres;
alter function public.void_document(jsonb) owner to postgres;

revoke all on function public.post_payment(jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.post_purchase_bill(jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.post_sales_invoice(jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.void_document(jsonb)
from public, anon, authenticated, service_role;

grant execute on function public.post_payment(jsonb) to service_role;
grant execute on function public.post_purchase_bill(jsonb) to service_role;
grant execute on function public.post_sales_invoice(jsonb) to service_role;
grant execute on function public.void_document(jsonb) to service_role;

-- Internal routines are owner-only implementation details. The service role
-- must enter through the actor-bound wrappers above (or the branch command,
-- which already enforces pos:expenses and assigned-location scope).
revoke all on function public.post_payment_internal(jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.post_purchase_bill_internal(jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.post_sales_invoice_internal(jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.void_document_internal(jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.post_branch_expense_internal(jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.create_posted_journal(uuid, date, text, text, uuid, text, jsonb)
from public, anon, authenticated, service_role;

commit;
