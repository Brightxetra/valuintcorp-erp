begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
begin
  if current_user <> 'postgres' then
    raise exception 'Stock receipt migrations must run as the postgres role.'
      using errcode = '42501';
  end if;
end;
$$;

alter table public.stock_movements
  add column if not exists operation_key uuid;

alter table public.stock_movements
  add column if not exists operation_fingerprint text;

comment on column public.stock_movements.operation_key is
  'Server-issued idempotency key for atomic inventory commands. NULL preserves legacy DML compatibility.';

comment on column public.stock_movements.operation_fingerprint is
  'SHA-256 of the normalized stock receipt request. It is present exactly when operation_key is present.';

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint constraint_record
    where constraint_record.conrelid = 'public.stock_movements'::regclass
      and constraint_record.conname = 'stock_movements_operation_identity_pair_chk'
  ) then
    alter table public.stock_movements
      add constraint stock_movements_operation_identity_pair_chk
      check (
        (operation_key is null) = (operation_fingerprint is null)
      ) not valid;
  end if;
end;
$$;

comment on constraint stock_movements_operation_identity_pair_chk
  on public.stock_movements is
  'NOT VALID during expand rollout to avoid a legacy-table scan; validate separately after rehearsal.';

create or replace function app_private.protect_stock_movement_operation_key()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  trusted_operation_key text := nullif(
    current_setting('app.stock_receipt_operation_key', true),
    ''
  );
  trusted_operation_fingerprint text := nullif(
    current_setting('app.stock_receipt_operation_fingerprint', true),
    ''
  );
begin
  if tg_op = 'INSERT' then
    if (new.operation_key is not null or new.operation_fingerprint is not null)
      and (
        current_user <> 'postgres'
        or trusted_operation_key is distinct from new.operation_key::text
        or trusted_operation_fingerprint is distinct from new.operation_fingerprint
      )
    then
      raise exception 'operation_key and operation_fingerprint can only be assigned by the stock receipt command.'
        using errcode = '42501';
    end if;

    return new;
  end if;

  if tg_op = 'UPDATE' then
    if current_user <> 'postgres'
      and (
        old.operation_key is not null
        or new.operation_key is not null
        or old.operation_fingerprint is not null
        or new.operation_fingerprint is not null
      )
    then
      raise exception 'Command-owned stock movements are immutable.'
        using errcode = '42501';
    end if;

    return new;
  end if;

  if current_user <> 'postgres'
    and (old.operation_key is not null or old.operation_fingerprint is not null)
  then
    raise exception 'Command-owned stock movements cannot be deleted.'
      using errcode = '42501';
  end if;

  return old;
end;
$$;

drop trigger if exists protect_stock_movement_operation_key
  on public.stock_movements;

create trigger protect_stock_movement_operation_key
before insert or update or delete on public.stock_movements
for each row execute function app_private.protect_stock_movement_operation_key();

revoke all on function app_private.protect_stock_movement_operation_key()
  from public, anon, authenticated, service_role;

create or replace function app_private.lock_stock_movement_posting_window()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  first_business_id uuid;
  second_business_id uuid;
begin
  perform pg_advisory_xact_lock_shared(
    hashtextextended('posting-period-dml-global', 0)
  );

  if tg_op = 'INSERT' then
    first_business_id := new.business_id;
  elsif tg_op = 'DELETE' then
    first_business_id := old.business_id;
  elsif old.business_id = new.business_id then
    first_business_id := new.business_id;
  elsif old.business_id < new.business_id then
    first_business_id := old.business_id;
    second_business_id := new.business_id;
  else
    first_business_id := new.business_id;
    second_business_id := old.business_id;
  end if;

  perform pg_advisory_xact_lock_shared(
    hashtextextended(
      'posting-period|' || first_business_id::text,
      0
    )
  );

  if second_business_id is not null then
    perform pg_advisory_xact_lock_shared(
      hashtextextended(
        'posting-period|' || second_business_id::text,
        0
      )
    );
  end if;

  if tg_op in ('UPDATE', 'DELETE')
    and public.is_period_locked(old.business_id, old.date)
  then
    raise exception 'Period is locked. Use a correction or reversal entry.'
      using errcode = '55000';
  end if;

  if tg_op in ('INSERT', 'UPDATE')
    and public.is_period_locked(new.business_id, new.date)
  then
    raise exception 'Period is locked. Use a correction or reversal entry.'
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists coordinate_stock_movement_posting_window
  on public.stock_movements;

create trigger coordinate_stock_movement_posting_window
before insert or update or delete on public.stock_movements
for each row execute function app_private.lock_stock_movement_posting_window();

comment on function app_private.lock_stock_movement_posting_window() is
  'Makes command and legacy writes coordinate with period close and protects both OLD and NEW periods.';

revoke all on function app_private.lock_stock_movement_posting_window()
  from public, anon, authenticated, service_role;

create or replace function app_private.post_stock_receipt_internal(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  target_business_id uuid;
  target_item_id uuid;
  target_warehouse_id uuid;
  request_operation_key uuid;
  receipt_date date;
  receipt_quantity numeric;
  raw_unit_cost numeric;
  unit_cost numeric;
  receipt_value numeric;
  receipt_memo text;
  display_actor_name text;
  request_fingerprint text;
  product_record record;
  warehouse_record record;
  existing_movement record;
  created_movement record;
begin
  if payload is null or jsonb_typeof(payload) is distinct from 'object' then
    raise exception 'Stock receipt payload must be a JSON object.'
      using errcode = '22023';
  end if;

  if jsonb_typeof(payload->'businessId') is distinct from 'string'
    or jsonb_typeof(payload->'itemId') is distinct from 'string'
    or jsonb_typeof(payload->'warehouseId') is distinct from 'string'
    or jsonb_typeof(payload->'operationKey') is distinct from 'string'
    or jsonb_typeof(payload->'date') is distinct from 'string'
    or jsonb_typeof(payload->'quantity') is distinct from 'number'
    or jsonb_typeof(payload->'unitCost') is distinct from 'number'
    or jsonb_typeof(payload->'actorName') is distinct from 'string'
  then
    raise exception 'Stock receipt payload has invalid field types.'
      using errcode = '22023';
  end if;

  if payload ? 'memo'
    and jsonb_typeof(payload->'memo') not in ('string', 'null')
  then
    raise exception 'Stock receipt memo must be text.'
      using errcode = '22023';
  end if;

  if (payload->>'date') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Stock receipt date must use YYYY-MM-DD.'
      using errcode = '22023';
  end if;

  begin
    target_business_id := nullif(payload->>'businessId', '')::uuid;
    target_item_id := nullif(payload->>'itemId', '')::uuid;
    target_warehouse_id := nullif(payload->>'warehouseId', '')::uuid;
    request_operation_key := nullif(payload->>'operationKey', '')::uuid;
    receipt_date := (payload->>'date')::date;
    receipt_quantity := round((payload->>'quantity')::numeric, 4);
    raw_unit_cost := (payload->>'unitCost')::numeric;
  exception
    when invalid_text_representation
      or invalid_datetime_format
      or datetime_field_overflow
    then
      raise exception 'Stock receipt contains an invalid UUID, date, or number.'
        using errcode = '22023';
  end;

  if target_business_id is null
    or target_item_id is null
    or target_warehouse_id is null
    or request_operation_key is null
    or receipt_date is null
  then
    raise exception 'Stock receipt identifiers and date are required.'
      using errcode = '22023';
  end if;

  if receipt_quantity is null
    or receipt_quantity <= 0
    or receipt_quantity >= 549755813888
  then
    raise exception 'Stock receipt quantity must be positive and safely representable at four decimals.'
      using errcode = '22023';
  end if;

  if raw_unit_cost is null or raw_unit_cost < 0 then
    raise exception 'Stock receipt unit cost must be zero or positive.'
      using errcode = '22023';
  end if;

  unit_cost := round(raw_unit_cost, 2);
  receipt_value := round(receipt_quantity * unit_cost, 2);

  if receipt_value >= 10000000000000000 then
    raise exception 'Stock receipt value must fit numeric(18,2).'
      using errcode = '22003';
  end if;

  receipt_memo := coalesce(nullif(btrim(payload->>'memo'), ''), 'Stok masuk manual');
  display_actor_name := nullif(btrim(payload->>'actorName'), '');

  if char_length(receipt_memo) > 500 then
    raise exception 'Stock receipt memo cannot exceed 500 characters.'
      using errcode = '22023';
  end if;

  if display_actor_name is null or char_length(display_actor_name) > 200 then
    raise exception 'Stock receipt actor name is required and cannot exceed 200 characters.'
      using errcode = '22023';
  end if;

  request_fingerprint := pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(
        pg_catalog.jsonb_build_array(
          target_business_id::text,
          target_item_id::text,
          target_warehouse_id::text,
          receipt_date::text,
          receipt_quantity::text,
          unit_cost::text,
          receipt_memo
        )::text,
        'UTF8'
      )
    ),
    'hex'
  );

  if auth.uid() is null then
    raise exception 'A signed-in request actor is required.'
      using errcode = '42501';
  end if;

  if not app_private.member_has_permission(
    target_business_id,
    'inventory:manage'
  ) then
    raise exception 'You are not allowed to perform inventory:manage.'
      using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'stock-receipt|' || target_business_id::text || '|' || request_operation_key::text,
      0
    )
  );

  select
    movement.id,
    movement.business_id,
    movement.item_id,
    movement.warehouse_id,
    movement.date,
    movement.type,
    movement.quantity,
    movement.value,
    movement.memo,
    movement.operation_fingerprint
  into existing_movement
  from public.stock_movements movement
  where movement.business_id = target_business_id
    and movement.operation_key = request_operation_key;

  if existing_movement.id is not null then
    if existing_movement.operation_fingerprint = request_fingerprint
      and existing_movement.item_id = target_item_id
      and existing_movement.warehouse_id = target_warehouse_id
      and existing_movement.date = receipt_date
      and existing_movement.type = 'purchase'
      and existing_movement.quantity = receipt_quantity
      and existing_movement.value = receipt_value
      and existing_movement.memo is not distinct from receipt_memo
    then
      return jsonb_build_object(
        'movementId', existing_movement.id,
        'created', false,
        'replayed', true,
        'movement', jsonb_build_object(
          'id', existing_movement.id,
          'businessId', existing_movement.business_id,
          'itemId', existing_movement.item_id,
          'warehouseId', existing_movement.warehouse_id,
          'date', existing_movement.date,
          'type', existing_movement.type,
          'quantity', existing_movement.quantity,
          'value', existing_movement.value,
          'memo', existing_movement.memo
        )
      );
    end if;

    raise exception 'Idempotency key was already used for a different stock receipt.'
      using errcode = '23505';
  end if;

  select product.sku, product.unit
  into product_record
  from public.products product
  where product.business_id = target_business_id
    and product.id = target_item_id
    and product.is_active = true
    and product.track_stock = true
    and product.is_purchasable = true
  for share;

  if product_record.sku is null then
    raise exception 'Stock product was not found, is inactive, or is not purchasable.'
      using errcode = '23503';
  end if;

  select warehouse.id, warehouse.name
  into warehouse_record
  from public.warehouses warehouse
  where warehouse.business_id = target_business_id
    and warehouse.id = target_warehouse_id
    and warehouse.is_active = true
  for share;

  if warehouse_record.id is null then
    raise exception 'Warehouse was not found or is inactive.'
      using errcode = '23503';
  end if;

  perform pg_advisory_xact_lock_shared(
    hashtextextended('posting-period-dml-global', 0)
  );

  perform pg_advisory_xact_lock_shared(
    hashtextextended(
      'posting-period|' || target_business_id::text,
      0
    )
  );

  if public.is_period_locked(target_business_id, receipt_date) then
    raise exception 'Period is locked. Use a correction or reversal entry.'
      using errcode = '55000';
  end if;

  perform set_config(
    'app.stock_receipt_operation_key',
    request_operation_key::text,
    true
  );
  perform set_config(
    'app.stock_receipt_operation_fingerprint',
    request_fingerprint,
    true
  );

  insert into public.stock_movements (
    business_id,
    item_id,
    warehouse_id,
    date,
    type,
    quantity,
    value,
    journal_entry_id,
    memo,
    operation_key,
    operation_fingerprint
  )
  values (
    target_business_id,
    target_item_id,
    target_warehouse_id,
    receipt_date,
    'purchase',
    receipt_quantity,
    receipt_value,
    null,
    receipt_memo,
    request_operation_key,
    request_fingerprint
  )
  returning
    id,
    business_id,
    item_id,
    warehouse_id,
    date,
    type,
    quantity,
    value,
    memo
  into created_movement;

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
    display_actor_name,
    'inventory',
    'stock receipt',
    product_record.sku || ' stok masuk '
      || trim_scale(receipt_quantity)::text || ' '
      || coalesce(nullif(product_record.unit, ''), 'unit') || '.'
  );

  return jsonb_build_object(
    'movementId', created_movement.id,
    'created', true,
    'replayed', false,
    'movement', jsonb_build_object(
      'id', created_movement.id,
      'businessId', created_movement.business_id,
      'itemId', created_movement.item_id,
      'warehouseId', created_movement.warehouse_id,
      'date', created_movement.date,
      'type', created_movement.type,
      'quantity', created_movement.quantity,
      'value', created_movement.value,
      'memo', created_movement.memo
    )
  );
end;
$$;

comment on function app_private.post_stock_receipt_internal(jsonb) is
  'Atomic stock receipt command. Replay equality requires the normalized request fingerprint and persisted movement effect.';

revoke all on function app_private.post_stock_receipt_internal(jsonb)
  from public, anon, authenticated, service_role;

create or replace function app_private.lock_report_period_posting_window()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  first_business_id uuid;
  second_business_id uuid;
begin
  if not pg_try_advisory_xact_lock(
    hashtextextended('posting-period-dml-global', 0)
  ) then
    raise exception 'Posting activity is in flight. Retry the period change.'
      using errcode = '55P03';
  end if;

  if tg_op = 'INSERT' then
    first_business_id := new.business_id;
  elsif tg_op = 'DELETE' then
    first_business_id := old.business_id;
  elsif old.business_id = new.business_id then
    first_business_id := new.business_id;
  elsif old.business_id < new.business_id then
    first_business_id := old.business_id;
    second_business_id := new.business_id;
  else
    first_business_id := new.business_id;
    second_business_id := old.business_id;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'posting-period|' || first_business_id::text,
      0
    )
  );

  if second_business_id is not null then
    perform pg_advisory_xact_lock(
      hashtextextended(
        'posting-period|' || second_business_id::text,
        0
      )
    );
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists lock_report_period_posting_window
  on public.report_periods;

create trigger lock_report_period_posting_window
before insert or update or delete on public.report_periods
for each row execute function app_private.lock_report_period_posting_window();

comment on function app_private.lock_report_period_posting_window() is
  'Fail-fast global exclusion avoids queued cross-workflow deadlocks; business moves then lock both tenants in UUID order.';

revoke all on function app_private.lock_report_period_posting_window()
  from public, anon, authenticated, service_role;

create or replace function public.set_report_period_lock_internal(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  target_business_id uuid := (payload->>'businessId')::uuid;
  period_label text := payload->>'label';
  period_start date := (payload->>'startDate')::date;
  period_end date := (payload->>'endDate')::date;
  should_lock boolean := (payload->>'locked')::boolean;
  period_id uuid;
  role text;
begin
  role := public.require_posting_role(
    target_business_id,
    array['owner', 'finance_admin', 'system_admin']
  );

  if period_end < period_start then
    raise exception 'Period end cannot be earlier than start.';
  end if;

  insert into public.report_periods (
    business_id,
    label,
    start_date,
    end_date,
    locked,
    locked_at,
    locked_by
  )
  values (
    target_business_id,
    period_label,
    period_start,
    period_end,
    should_lock,
    case when should_lock then now() else null end,
    case when should_lock then auth.uid() else null end
  )
  on conflict (business_id, start_date, end_date)
  do update set
    label = excluded.label,
    locked = excluded.locked,
    locked_at = excluded.locked_at,
    locked_by = excluded.locked_by
  returning id into period_id;

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
    'accounting',
    case when should_lock then 'period locked' else 'period reopened' end,
    'Period ' || period_label || ' was updated by role ' || role || '.'
  );

  return period_id;
end;
$$;

comment on function public.set_report_period_lock_internal(jsonb) is
  'Actor-bound period lock command. The report-period trigger fails fast while postings are in flight, then locks affected businesses.';

revoke all on function public.set_report_period_lock_internal(jsonb)
  from public, anon, authenticated, service_role;

commit;
