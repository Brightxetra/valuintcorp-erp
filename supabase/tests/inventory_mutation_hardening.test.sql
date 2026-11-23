begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

select is(
  current_user::text,
  'postgres',
  'inventory mutation rehearsal runs as postgres'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint constraint_record
    where constraint_record.conrelid = 'public.stock_movements'::regclass
      and constraint_record.conname = 'stock_movements_operation_identity_pair_chk'
      and constraint_record.contype = 'c'
      and constraint_record.convalidated
      and pg_catalog.pg_get_constraintdef(constraint_record.oid)
        ilike '%(operation_key IS NULL) = (operation_fingerprint IS NULL)%'
  ),
  'the operation identity pair constraint is validated after expand'
);

select ok(
  pg_catalog.pg_get_functiondef(
    'app_private.lock_pos_sale_inventory_keys(jsonb)'::regprocedure
  ) ilike '%product_structure_lines%'
  and pg_catalog.pg_get_functiondef(
    'app_private.lock_pos_sale_inventory_keys(jsonb)'::regprocedure
  ) ilike '%fulfillment_method = ''recipe_on_sale''%'
  and pg_catalog.pg_get_functiondef(
    'app_private.lock_pos_sale_inventory_keys(jsonb)'::regprocedure
  ) ilike '%order by affected_item.item_id%'
  and pg_catalog.pg_get_functiondef(
    'app_private.lock_pos_sale_inventory_keys(jsonb)'::regprocedure
  ) ilike '%hashtextextended(%inventory-stock|%',
  'POS pre-locking includes recipe components and acquires inventory keys in UUID order'
);

select ok(
  not has_function_privilege(
    'service_role',
    'app_private.lock_pos_sale_inventory_keys(jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'app_private.lock_pos_sale_inventory_keys(jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'app_private.lock_pos_sale_inventory_keys(jsonb)',
    'EXECUTE'
  ),
  'the POS inventory-lock helper has no direct API execution path'
);

select ok(
  strpos(
    pg_catalog.pg_get_functiondef('public.post_pos_sale(jsonb)'::regprocedure),
    'lock_pos_sale_inventory_keys'
  ) > 0
  and strpos(
    pg_catalog.pg_get_functiondef('public.post_pos_sale(jsonb)'::regprocedure),
    'lock_pos_sale_inventory_keys'
  ) < strpos(
    pg_catalog.pg_get_functiondef('public.post_pos_sale(jsonb)'::regprocedure),
    'post_pos_sale_internal'
  )
  and has_function_privilege(
    'service_role',
    'public.post_pos_sale(jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.post_pos_sale(jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.post_pos_sale_internal(jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.post_pos_sale_internal(jsonb)',
    'EXECUTE'
  ),
  'the service-only POS wrapper pre-locks before invoking non-callable internal posting logic'
);

select ok(
  pg_catalog.pg_get_functiondef(
    'public.ensure_stock_movement_consistency()'::regprocedure
  ) ilike '%values%old.business_id%old.item_id%old.warehouse_id%new.business_id%new.item_id%new.warehouse_id%'
  and pg_catalog.pg_get_functiondef(
    'public.ensure_stock_movement_consistency()'::regprocedure
  ) ilike '%order by%inventory_key.business_id%inventory_key.item_id%inventory_key.warehouse_id%'
  and pg_catalog.pg_get_functiondef(
    'public.ensure_stock_movement_consistency()'::regprocedure
  ) ilike '%projected_quantity%available_quantity - old_quantity_effect + new_quantity_effect%'
  and pg_catalog.pg_get_functiondef(
    'public.ensure_stock_movement_consistency()'::regprocedure
  ) ilike '%projected_value%available_value - old_value_effect + new_value_effect%',
  'UPDATE checks lock and project both OLD and NEW balance keys canonically'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_trigger trigger_record
    where trigger_record.tgrelid = 'public.stock_movements'::regclass
      and trigger_record.tgname = 'prevent_locked_stock_movements'
      and not trigger_record.tgisinternal
      and pg_catalog.pg_get_triggerdef(trigger_record.oid)
        ilike '%before insert or update%'
  ),
  'the hardened consistency function remains installed on INSERT and UPDATE'
);

insert into public.businesses (
  id,
  legal_name,
  display_name,
  industry,
  owner_name
)
values (
  'd0000000-0000-4000-8000-000000000001',
  'Inventory Mutation Test',
  'Inventory Mutation Test',
  'retail',
  'Test Owner'
);

insert into public.warehouses (
  id,
  business_id,
  code,
  name,
  is_active
)
values (
  'd1000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000001',
  'INV-MAIN',
  'Inventory Main',
  true
);

insert into public.products (
  id,
  business_id,
  sku,
  name,
  unit,
  track_stock,
  is_purchasable,
  is_active
)
values
  (
    'd2000000-0000-4000-8000-000000000001',
    'd0000000-0000-4000-8000-000000000001',
    'INV-A',
    'Inventory A',
    'pcs',
    true,
    true,
    true
  ),
  (
    'd2000000-0000-4000-8000-000000000002',
    'd0000000-0000-4000-8000-000000000001',
    'INV-B',
    'Inventory B',
    'pcs',
    true,
    true,
    true
  );

insert into public.stock_movements (
  id,
  business_id,
  item_id,
  warehouse_id,
  date,
  type,
  quantity,
  value,
  memo
)
values
  (
    'd3000000-0000-4000-8000-000000000001',
    'd0000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    '2026-08-01',
    'purchase',
    10,
    100,
    'Opening stock'
  ),
  (
    'd3000000-0000-4000-8000-000000000002',
    'd0000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    '2026-08-02',
    'sale',
    5,
    50,
    'Opening sale'
  );

select throws_ok(
  $command$
    update public.stock_movements
    set quantity = 11
    where id = 'd3000000-0000-4000-8000-000000000002'
  $command$,
  'P0001',
  'Stock tidak cukup. Barang habis harus direstock dulu sebelum bisa dijual atau dikurangi.',
  'an UPDATE cannot increase an outgoing movement beyond available quantity'
);

select throws_ok(
  $command$
    update public.stock_movements
    set value = 200
    where id = 'd3000000-0000-4000-8000-000000000002'
  $command$,
  'P0001',
  'Nilai stok tidak cukup. Restock atau koreksi nilai stok dulu sebelum stok dikurangi.',
  'an UPDATE cannot increase an outgoing movement beyond available stock value'
);

select throws_ok(
  $command$
    update public.stock_movements
    set item_id = 'd2000000-0000-4000-8000-000000000002'
    where id = 'd3000000-0000-4000-8000-000000000001'
  $command$,
  'P0001',
  'Stock tidak cukup. Barang habis harus direstock dulu sebelum bisa dijual atau dikurangi.',
  'moving an inbound row cannot leave its OLD inventory key negative'
);

select lives_ok(
  $command$
    update public.stock_movements
    set quantity = 4,
        value = 40
    where id = 'd3000000-0000-4000-8000-000000000002'
  $command$,
  'an UPDATE that leaves quantity and value non-negative succeeds'
);

select is(
  public.current_stock_quantity(
    'd0000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001'
  ),
  6::numeric,
  'the successful UPDATE leaves the expected stock quantity'
);

select * from finish();

rollback;
