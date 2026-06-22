-- Branch POS and per-member access controls.
-- A custom access scope replaces the role default for a member. Owners and
-- system administrators always retain their full role access.

alter table public.business_members
  add column if not exists access_scope text not null default 'role'
    check (access_scope in ('role', 'custom')),
  add column if not exists access_permissions text[] not null default '{}'::text[],
  add column if not exists location_ids uuid[] not null default '{}'::uuid[];

alter table public.member_invites
  add column if not exists access_scope text not null default 'role'
    check (access_scope in ('role', 'custom')),
  add column if not exists access_permissions text[] not null default '{}'::text[],
  add column if not exists location_ids uuid[] not null default '{}'::uuid[];

alter table public.sales_invoices
  add column if not exists location_id uuid references public.locations(id),
  add column if not exists source text not null default 'manual'
    check (source in ('manual', 'pos'));

create or replace function public.ensure_pos_walk_in_customer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.customers (business_id, code, name, credit_limit, is_active)
  values (new.id, 'POS-UMUM', 'Pelanggan Umum', 0, true)
  on conflict (business_id, code) do nothing;
  return new;
end;
$$;

drop trigger if exists ensure_pos_walk_in_customer_on_business on public.businesses;
create trigger ensure_pos_walk_in_customer_on_business
after insert on public.businesses
for each row execute function public.ensure_pos_walk_in_customer();

insert into public.customers (business_id, code, name, credit_limit, is_active)
select business.id, 'POS-UMUM', 'Pelanggan Umum', 0, true
from public.businesses business

on conflict (business_id, code) do nothing;
create index if not exists sales_invoices_business_location_source_date_idx
  on public.sales_invoices (business_id, location_id, source, date desc);

create table if not exists public.branch_expenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid not null references public.locations(id),
  date date not null,
  amount numeric(18, 2) not null check (amount > 0),
  payment_method text not null default 'cash'
    check (payment_method in ('cash', 'bank_transfer', 'qris', 'marketplace', 'other')),
  category text not null,
  memo text,
  journal_entry_id uuid references public.journal_entries(id),
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists branch_expenses_business_location_date_idx
  on public.branch_expenses (business_id, location_id, date desc);

alter table public.branch_expenses enable row level security;

drop policy if exists "members can read branch expenses" on public.branch_expenses;
create policy "members can read branch expenses" on public.branch_expenses for select
using (public.is_business_member(business_id));

drop policy if exists "owners can manage branch expenses" on public.branch_expenses;
create policy "owners can manage branch expenses" on public.branch_expenses for all
using (public.has_business_role(business_id, array['owner', 'finance_admin', 'system_admin']))
with check (public.has_business_role(business_id, array['owner', 'finance_admin', 'system_admin']));

create or replace function app_private.member_has_permission(
  target_business_id uuid,
  target_permission text
)
returns boolean
language plpgsql
security definer
set search_path = app_private, public
as $$
declare
  member_record record;
begin
  select role, access_scope, access_permissions
  into member_record
  from public.business_members
  where business_id = target_business_id
    and auth_user_id = auth.uid();

  if member_record.role is null then
    return false;
  end if;

  if member_record.role in ('owner', 'system_admin') then
    return true;
  end if;

  if member_record.access_scope = 'custom' then
    return target_permission = any(coalesce(member_record.access_permissions, '{}'::text[]));
  end if;

  return case member_record.role
    when 'finance_admin' then target_permission = any(array[
      'business:read', 'accounting:read', 'accounting:write', 'reports:export',
      'inventory:manage', 'tax:prepare', 'pos:read'
    ])
    when 'staff' then target_permission = any(array['business:read', 'accounting:write', 'inventory:manage'])
    when 'hr' then target_permission = any(array['business:read', 'hr:manage', 'payroll:run', 'reports:export'])
    when 'external_advisor' then target_permission = any(array['business:read', 'accounting:read', 'reports:export', 'tax:prepare'])
    else false
  end;
end;
$$;

create or replace function app_private.member_has_location_access(
  target_business_id uuid,
  target_location_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = app_private, public
as $$
declare
  member_record record;
begin
  select role, access_scope, location_ids
  into member_record
  from public.business_members
  where business_id = target_business_id
    and auth_user_id = auth.uid();

  if member_record.role is null then
    return false;
  end if;

  if member_record.role in ('owner', 'system_admin') or member_record.access_scope = 'role' then
    return true;
  end if;

  return target_location_id = any(coalesce(member_record.location_ids, '{}'::uuid[]));
end;
$$;

create or replace function app_private.require_pos_access(
  target_business_id uuid,
  target_location_id uuid,
  target_permission text
)
returns text
language plpgsql
security definer
set search_path = app_private, public
as $$
declare
  member_role text;
begin
  select role into member_role
  from public.business_members
  where business_id = target_business_id
    and auth_user_id = auth.uid();

  if member_role is null then
    raise exception 'User is not a member of this business.';
  end if;

  if not app_private.member_has_permission(target_business_id, target_permission) then
    raise exception 'You are not allowed to perform %.', target_permission;
  end if;

  if not app_private.member_has_location_access(target_business_id, target_location_id) then
    raise exception 'You are not assigned to this branch.';
  end if;

  return member_role;
end;
$$;

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
  line_product_id uuid;
  qty numeric;
  unit_price numeric;
  invoice_id uuid;
  pos_customer_id uuid;
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

    if product_record.track_stock
      and public.current_stock_quantity(target_business_id, line_product_id, location_record.warehouse_id) < qty then
      raise exception 'Insufficient stock at this branch.';
    end if;

    total := total + (qty * unit_price);
    cogs_total := cogs_total + case when product_record.track_stock then qty * product_record.purchase_price else 0 end;
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

    insert into public.sales_invoice_lines (
      business_id, sales_invoice_id, product_id, warehouse_id, description, quantity, unit_price, cogs
    ) values (
      target_business_id, invoice_id, line_product_id, location_record.warehouse_id,
      product_record.name, qty, unit_price, product_record.purchase_price
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

    if product_record.track_stock then
      insert into public.stock_movements (
        business_id, item_id, warehouse_id, date, type, quantity, value, journal_entry_id, memo
      ) values (
        target_business_id, line_product_id, location_record.warehouse_id, sale_date,
        'sale', qty, qty * product_record.purchase_price, sales_journal_id, invoice_no
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

create or replace function public.post_pos_sale(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  perform app_private.apply_request_actor(nullif(payload->>'actorUserId', '')::uuid);
  return public.post_pos_sale_internal(payload - 'actorUserId');
end;
$$;

create or replace function public.post_branch_expense_internal(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  target_business_id uuid := (payload->>'businessId')::uuid;
  target_location_id uuid := (payload->>'locationId')::uuid;
  expense_date date := coalesce(nullif(payload->>'date', '')::date, current_date);
  expense_amount numeric := (payload->>'amount')::numeric;
  expense_category text := nullif(payload->>'category', '');
  expense_memo text := nullif(payload->>'memo', '');
  payment_method_value text := coalesce(nullif(payload->>'paymentMethod', ''), 'cash');
  expense_id uuid;
  journal_id uuid;
  member_role text;
begin
  if expense_amount is null or expense_amount <= 0 or expense_category is null then
    raise exception 'A positive amount and expense category are required.';
  end if;

  member_role := app_private.require_pos_access(target_business_id, target_location_id, 'pos:expenses');

  if public.is_period_locked(target_business_id, expense_date) then
    raise exception 'Period is locked. Use a correction or reversal entry.';
  end if;

  if not exists (
    select 1 from public.locations
    where id = target_location_id and business_id = target_business_id and is_active = true and type in ('branch', 'outlet', 'store')
  ) then
    raise exception 'Branch is not active.';
  end if;

  insert into public.chart_of_accounts (
    business_id, code, name, type, normal_balance, category, is_system, is_active
  ) values (
    target_business_id, '5100', 'Beban Operasional', 'expense', 'debit', 'operating_expense', true, true
  ) on conflict (business_id, code) do nothing;

  insert into public.branch_expenses (
    business_id, location_id, date, amount, payment_method, category, memo, created_by
  ) values (
    target_business_id, target_location_id, expense_date, expense_amount,
    payment_method_value, expense_category, expense_memo, auth.uid()
  ) returning id into expense_id;

  journal_id := public.create_posted_journal(
    target_business_id,
    expense_date,
    'Biaya cabang ' || expense_category,
    'manual_transaction',
    expense_id,
    member_role,
    jsonb_build_array(
      jsonb_build_object('accountCode', '5100', 'debit', expense_amount, 'credit', 0, 'memo', expense_memo),
      jsonb_build_object('accountCode', '1000', 'debit', 0, 'credit', expense_amount, 'memo', expense_memo)
    )
  );

  update public.branch_expenses set journal_entry_id = journal_id where id = expense_id;

  insert into public.activity_events (business_id, actor_user_id, actor_name, module, action, description)
  values (target_business_id, auth.uid(), coalesce(auth.uid()::text, 'Kasir'), 'accounting', 'posted branch expense', expense_category);

  return expense_id;
end;
$$;

create or replace function public.post_branch_expense(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  perform app_private.apply_request_actor(nullif(payload->>'actorUserId', '')::uuid);
  return public.post_branch_expense_internal(payload - 'actorUserId');
end;
$$;

create or replace function public.accept_member_invite(target_business_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_record record;
  invite_email text := lower(coalesce(auth.jwt()->>'email', ''));
begin
  if auth.uid() is null or invite_email = '' then
    raise exception 'Authentication with email is required.';
  end if;

  select * into invite_record
  from public.member_invites
  where business_id = target_business_id
    and lower(email) = invite_email
    and status = 'pending'
    and expires_at > now()
  order by created_at desc
  limit 1;

  if invite_record.id is null then
    raise exception 'No active invite found for this user and business.';
  end if;

  insert into public.business_members (
    business_id, auth_user_id, role, access_scope, access_permissions, location_ids
  ) values (
    target_business_id, auth.uid(), invite_record.role,
    invite_record.access_scope, invite_record.access_permissions, invite_record.location_ids
  ) on conflict (business_id, auth_user_id) do update set
    role = excluded.role,
    access_scope = excluded.access_scope,
    access_permissions = excluded.access_permissions,
    location_ids = excluded.location_ids;

  update public.member_invites
  set status = 'accepted', accepted_by = auth.uid(), accepted_at = now()
  where id = invite_record.id;

  return invite_record.id;
end;
$$;

revoke execute on function public.post_pos_sale(jsonb) from public, anon, authenticated;
revoke execute on function public.post_pos_sale_internal(jsonb) from public, anon, authenticated;
revoke execute on function public.post_branch_expense(jsonb) from public, anon, authenticated;
revoke execute on function public.post_branch_expense_internal(jsonb) from public, anon, authenticated;
revoke execute on function public.accept_member_invite(uuid) from public, anon, authenticated;

grant execute on function public.post_pos_sale(jsonb) to service_role;
grant execute on function public.post_pos_sale_internal(jsonb) to service_role;
grant execute on function public.post_branch_expense(jsonb) to service_role;
grant execute on function public.post_branch_expense_internal(jsonb) to service_role;
grant execute on function public.accept_member_invite(uuid) to service_role;

revoke execute on function app_private.member_has_permission(uuid, text) from public, anon, authenticated;
revoke execute on function app_private.member_has_location_access(uuid, uuid) from public, anon, authenticated;
revoke execute on function app_private.require_pos_access(uuid, uuid, text) from public, anon, authenticated;
grant execute on function app_private.member_has_permission(uuid, text) to service_role;
grant execute on function app_private.member_has_location_access(uuid, uuid) to service_role;
grant execute on function app_private.require_pos_access(uuid, uuid, text) to service_role;
