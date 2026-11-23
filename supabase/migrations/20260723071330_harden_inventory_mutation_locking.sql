begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
begin
  if current_user <> 'postgres' then
    raise exception 'Inventory locking migrations must run as the postgres role.'
      using errcode = '42501';
  end if;
end;
$$;

create or replace function app_private.lock_pos_sale_inventory_keys(payload jsonb)
returns void
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  target_business_id uuid := (payload->>'businessId')::uuid;
  target_location_id uuid := (payload->>'locationId')::uuid;
  sale_date date := coalesce(nullif(payload->>'date', '')::date, current_date);
  payment_method_value text := coalesce(nullif(payload->>'paymentMethod', ''), 'cash');
  line_items jsonb := payload->'items';
  line_item jsonb;
  location_record record;
  affected_item_id uuid;
  line_product_id uuid;
  qty numeric;
  unit_price numeric;
begin
  if pg_catalog.jsonb_typeof(line_items) <> 'array'
    or pg_catalog.jsonb_array_length(line_items) = 0
  then
    raise exception 'At least one POS item is required.';
  end if;

  if payment_method_value not in ('cash', 'bank_transfer', 'qris', 'marketplace', 'other') then
    raise exception 'Unsupported payment method.';
  end if;

  perform app_private.require_pos_access(
    target_business_id,
    target_location_id,
    'pos:sell'
  );

  if public.is_period_locked(target_business_id, sale_date) then
    raise exception 'Period is locked. Use a correction or reversal entry.';
  end if;

  select location.id, location.warehouse_id
  into location_record
  from public.locations location
  where location.id = target_location_id
    and location.business_id = target_business_id
    and location.is_active = true
    and location.type in ('branch', 'outlet', 'store');

  if location_record.id is null or location_record.warehouse_id is null then
    raise exception 'An active branch with a warehouse is required for POS.';
  end if;

  for line_item in
    select item.value
    from pg_catalog.jsonb_array_elements(line_items) with ordinality
      as item(value, position)
    order by item.position
  loop
    line_product_id := nullif(line_item->>'productId', '')::uuid;
    qty := (line_item->>'quantity')::numeric;
    unit_price := coalesce(nullif(line_item->>'unitPrice', '')::numeric, 0);

    if line_product_id is null or qty is null or qty <= 0 or unit_price < 0 then
      raise exception 'Each POS item requires a product, positive quantity, and valid price.';
    end if;
  end loop;

  for affected_item_id in
    with requested_items as (
      select distinct nullif(item.value->>'productId', '')::uuid as item_id
      from pg_catalog.jsonb_array_elements(line_items) as item(value)
    ),
    affected_items as (
      -- Keep the parent-product locks used by the legacy implementation.
      select requested_item.item_id
      from requested_items requested_item

      union

      -- Recipe sales write component movements, so lock every component that
      -- an active structure could select before any stock balance is read.
      select structure_line.component_product_id
      from requested_items requested_item
      join public.products parent_product
        on parent_product.id = requested_item.item_id
        and parent_product.business_id = target_business_id
        and parent_product.fulfillment_method = 'recipe_on_sale'
      join public.product_structures structure
        on structure.business_id = target_business_id
        and structure.parent_product_id = parent_product.id
        and structure.is_active = true
      join public.product_structure_lines structure_line
        on structure_line.business_id = target_business_id
        and structure_line.structure_id = structure.id
      join public.products component_product
        on component_product.id = structure_line.component_product_id
        and component_product.business_id = target_business_id
        and component_product.track_stock = true
    )
    select affected_item.item_id
    from affected_items affected_item
    where affected_item.item_id is not null
    order by affected_item.item_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'inventory-stock|'
          || target_business_id::text || '|'
          || affected_item_id::text || '|'
          || location_record.warehouse_id::text,
        0
      )
    );
  end loop;
end;
$$;

comment on function app_private.lock_pos_sale_inventory_keys(jsonb) is
  'Validates the POS pre-lock boundary and acquires all parent/component inventory keys in UUID order before the legacy posting function reads stock.';

revoke all on function app_private.lock_pos_sale_inventory_keys(jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.post_pos_sale(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  trusted_payload jsonb := payload - 'actorUserId';
begin
  perform app_private.apply_request_actor(
    nullif(payload->>'actorUserId', '')::uuid
  );

  perform app_private.lock_pos_sale_inventory_keys(trusted_payload);

  return public.post_pos_sale_internal(trusted_payload);
end;
$$;

alter function public.post_pos_sale(jsonb) owner to postgres;

comment on function public.post_pos_sale(jsonb) is
  'Service-role-only actor-bound POS entry point. Inventory keys are pre-locked canonically before posting.';

revoke all on function public.post_pos_sale(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.post_pos_sale(jsonb)
  to service_role;

-- Migration 025 exposed this SECURITY DEFINER implementation to service_role.
-- Keep only the actor-bound wrapper callable so the canonical pre-lock cannot
-- be bypassed by an alternate Data API RPC path.
revoke all on function public.post_pos_sale_internal(jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.ensure_stock_movement_consistency()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  item_business uuid;
  warehouse_business uuid;
  affected_key record;
  available_quantity numeric;
  available_value numeric;
  old_quantity_effect numeric;
  new_quantity_effect numeric;
  old_value_effect numeric;
  new_value_effect numeric;
  projected_quantity numeric;
  projected_value numeric;
begin
  select product.business_id
  into item_business
  from public.products product
  where product.id = new.item_id;

  select warehouse.business_id
  into warehouse_business
  from public.warehouses warehouse
  where warehouse.id = new.warehouse_id;

  if item_business is distinct from new.business_id
    or warehouse_business is distinct from new.business_id
  then
    raise exception 'Stock movement item and warehouse must belong to the same business.';
  end if;

  if tg_op = 'UPDATE'
    and public.is_period_locked(old.business_id, old.date)
  then
    raise exception 'Period is locked. Use a correction or reversal entry.';
  end if;

  if public.is_period_locked(new.business_id, new.date) then
    raise exception 'Period is locked. Use a correction or reversal entry.';
  end if;

  if tg_op = 'UPDATE' then
    -- Acquire every OLD/NEW balance key before reading any balance. UUID tuple
    -- ordering prevents opposite-direction row moves from reversing lock order.
    for affected_key in
      select
        inventory_key.business_id,
        inventory_key.item_id,
        inventory_key.warehouse_id
      from (
        values
          (old.business_id, old.item_id, old.warehouse_id),
          (new.business_id, new.item_id, new.warehouse_id)
      ) as inventory_key(business_id, item_id, warehouse_id)
      group by
        inventory_key.business_id,
        inventory_key.item_id,
        inventory_key.warehouse_id
      order by
        inventory_key.business_id,
        inventory_key.item_id,
        inventory_key.warehouse_id
    loop
      perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
          'inventory-stock|'
            || affected_key.business_id::text || '|'
            || affected_key.item_id::text || '|'
            || affected_key.warehouse_id::text,
          0
        )
      );
    end loop;

    for affected_key in
      select
        inventory_key.business_id,
        inventory_key.item_id,
        inventory_key.warehouse_id
      from (
        values
          (old.business_id, old.item_id, old.warehouse_id),
          (new.business_id, new.item_id, new.warehouse_id)
      ) as inventory_key(business_id, item_id, warehouse_id)
      group by
        inventory_key.business_id,
        inventory_key.item_id,
        inventory_key.warehouse_id
      order by
        inventory_key.business_id,
        inventory_key.item_id,
        inventory_key.warehouse_id
    loop
      select
        coalesce(sum(
          case
            when movement.type in ('purchase', 'transfer_in', 'adjustment_in')
              then movement.quantity
            else -movement.quantity
          end
        ), 0),
        coalesce(sum(
          case
            when movement.type in ('purchase', 'transfer_in', 'adjustment_in')
              then movement.value
            else -movement.value
          end
        ), 0)
      into available_quantity, available_value
      from public.stock_movements movement
      where movement.business_id = affected_key.business_id
        and movement.item_id = affected_key.item_id
        and movement.warehouse_id = affected_key.warehouse_id;

      old_quantity_effect := case
        when old.business_id = affected_key.business_id
          and old.item_id = affected_key.item_id
          and old.warehouse_id = affected_key.warehouse_id
        then case
          when old.type in ('purchase', 'transfer_in', 'adjustment_in')
            then old.quantity
          else -old.quantity
        end
        else 0
      end;
      new_quantity_effect := case
        when new.business_id = affected_key.business_id
          and new.item_id = affected_key.item_id
          and new.warehouse_id = affected_key.warehouse_id
        then case
          when new.type in ('purchase', 'transfer_in', 'adjustment_in')
            then new.quantity
          else -new.quantity
        end
        else 0
      end;
      old_value_effect := case
        when old.business_id = affected_key.business_id
          and old.item_id = affected_key.item_id
          and old.warehouse_id = affected_key.warehouse_id
        then case
          when old.type in ('purchase', 'transfer_in', 'adjustment_in')
            then old.value
          else -old.value
        end
        else 0
      end;
      new_value_effect := case
        when new.business_id = affected_key.business_id
          and new.item_id = affected_key.item_id
          and new.warehouse_id = affected_key.warehouse_id
        then case
          when new.type in ('purchase', 'transfer_in', 'adjustment_in')
            then new.value
          else -new.value
        end
        else 0
      end;

      projected_quantity :=
        available_quantity - old_quantity_effect + new_quantity_effect;
      projected_value :=
        available_value - old_value_effect + new_value_effect;

      if projected_quantity < 0
        and projected_quantity < available_quantity
      then
        raise exception 'Stock tidak cukup. Barang habis harus direstock dulu sebelum bisa dijual atau dikurangi.';
      end if;

      if projected_value < -0.5
        and projected_value < available_value
      then
        raise exception 'Nilai stok tidak cukup. Restock atau koreksi nilai stok dulu sebelum stok dikurangi.';
      end if;
    end loop;
  elsif new.type in ('sale', 'transfer_out', 'adjustment_out') then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'inventory-stock|'
          || new.business_id::text || '|'
          || new.item_id::text || '|'
          || new.warehouse_id::text,
        0
      )
    );

    select
      coalesce(sum(
        case
          when movement.type in ('purchase', 'transfer_in', 'adjustment_in')
            then movement.quantity
          else -movement.quantity
        end
      ), 0),
      coalesce(sum(
        case
          when movement.type in ('purchase', 'transfer_in', 'adjustment_in')
            then movement.value
          else -movement.value
        end
      ), 0)
    into available_quantity, available_value
    from public.stock_movements movement
    where movement.business_id = new.business_id
      and movement.item_id = new.item_id
      and movement.warehouse_id = new.warehouse_id;

    if available_quantity < new.quantity then
      raise exception 'Stock tidak cukup. Barang habis harus direstock dulu sebelum bisa dijual atau dikurangi.';
    end if;

    if new.value > 0 and available_value + 0.5 < new.value then
      raise exception 'Nilai stok tidak cukup. Restock atau koreksi nilai stok dulu sebelum stok dikurangi.';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.ensure_stock_movement_consistency() is
  'Protects INSERT and UPDATE stock balances. UPDATE locks distinct OLD/NEW keys canonically and rejects quantity/value regressions below zero.';

revoke all on function public.ensure_stock_movement_consistency()
  from public, anon, authenticated;
grant execute on function public.ensure_stock_movement_consistency()
  to service_role;

commit;
