begin;

create extension if not exists pgtap with schema extensions;

select plan(48);

with inventory_tables(table_name) as (
  values
    ('stock_movements'::text),
    ('stock_adjustments'::text),
    ('stock_transfers'::text)
), denied_privileges(privilege_name) as (
  values
    ('INSERT'::text),
    ('UPDATE'::text),
    ('DELETE'::text),
    ('TRUNCATE'::text),
    ('REFERENCES'::text),
    ('TRIGGER'::text),
    ('MAINTAIN'::text)
)
select is(
  (
    select count(*)
    from inventory_tables
    where not has_table_privilege(
      'authenticated',
      format('public.%I', table_name),
      'SELECT'
    )
    or exists (
      select 1
      from denied_privileges
      where has_table_privilege(
        'authenticated',
        format('public.%I', table_name),
        privilege_name
      )
    )
  ),
  0::bigint,
  'authenticated has read-only table privileges on inventory documents'
);

with inventory_tables(table_name) as (
  values
    ('stock_movements'::text),
    ('stock_adjustments'::text),
    ('stock_transfers'::text)
), table_privileges(privilege_name) as (
  values
    ('SELECT'::text),
    ('INSERT'::text),
    ('UPDATE'::text),
    ('DELETE'::text),
    ('TRUNCATE'::text),
    ('REFERENCES'::text),
    ('TRIGGER'::text),
    ('MAINTAIN'::text)
)
select is(
  (
    select count(*)
    from inventory_tables
    cross join table_privileges
    where has_table_privilege(
      'anon',
      format('public.%I', table_name),
      privilege_name
    )
  ),
  0::bigint,
  'anon has no table privileges on inventory documents'
);

with inventory_tables(table_name) as (
  values
    ('stock_movements'::text),
    ('stock_adjustments'::text),
    ('stock_transfers'::text)
), required_privileges(privilege_name) as (
  values
    ('SELECT'::text),
    ('INSERT'::text),
    ('UPDATE'::text),
    ('DELETE'::text)
)
select is(
  (
    select count(*)
    from inventory_tables
    cross join required_privileges
    where not has_table_privilege(
      'service_role',
      format('public.%I', table_name),
      privilege_name
    )
  ),
  0::bigint,
  'service_role retains inventory table privileges for trusted commands'
);

select is(
  (
    select count(*)
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = any(array[
        'stock_movements',
        'stock_adjustments',
        'stock_transfers'
      ])
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  ),
  0::bigint,
  'no direct inventory mutation policy remains'
);

with command_functions(signature) as (
  values
    ('public.post_stock_receipt(jsonb)'::text),
    ('public.post_stock_adjustment(jsonb)'::text),
    ('public.post_stock_transfer(jsonb)'::text),
    ('public.void_document(jsonb)'::text)
)
select is(
  (
    select count(*)
    from command_functions
    where not has_function_privilege('service_role', signature, 'EXECUTE')
      or has_function_privilege('authenticated', signature, 'EXECUTE')
      or has_function_privilege('anon', signature, 'EXECUTE')
  ),
  0::bigint,
  'inventory commands are service-role-only actor-bound entrypoints'
);

with internal_functions(signature) as (
  values
    ('app_private.post_stock_receipt_internal(jsonb)'::text),
    ('public.post_stock_adjustment_internal(jsonb)'::text),
    ('public.post_stock_transfer_internal(jsonb)'::text),
    ('app_private.void_inventory_document_internal(jsonb)'::text)
)
select is(
  (
    select count(*)
    from internal_functions
    where has_function_privilege('service_role', signature, 'EXECUTE')
      or has_function_privilege('authenticated', signature, 'EXECUTE')
      or has_function_privilege('anon', signature, 'EXECUTE')
  ),
  0::bigint,
  'owner-only inventory internals cannot bypass actor-bound wrappers'
);

select ok(
  not has_function_privilege(
    'service_role',
    'app_private.member_has_warehouse_access(uuid,uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'app_private.member_has_warehouse_access(uuid,uuid)',
    'EXECUTE'
  ),
  'warehouse authorization helper is available only to authenticated RLS evaluation'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_proc procedure_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    join pg_catalog.pg_roles owner_record
      on owner_record.oid = procedure_record.proowner
    where procedure_record.oid =
      'app_private.member_has_warehouse_access(uuid,uuid)'::regprocedure
      and namespace_record.nspname = 'app_private'
      and procedure_record.prosecdef
      and procedure_record.provolatile = 's'
      and procedure_record.proconfig = array['search_path=pg_catalog']::text[]
      and owner_record.rolname = 'postgres'
  ),
  'warehouse authorization helper has a fixed path and trusted owner'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_proc procedure_record
    join pg_catalog.pg_roles owner_record
      on owner_record.oid = procedure_record.proowner
    where procedure_record.oid =
      'app_private.void_inventory_document_internal(jsonb)'::regprocedure
      and not procedure_record.prosecdef
      and procedure_record.proconfig = array['search_path=pg_catalog']::text[]
      and owner_record.rolname = 'postgres'
  ),
  'inventory reversal internal is a fixed-path owner-only invoker routine'
);

select is(
  (
    select count(*)
    from pg_catalog.pg_proc procedure_record
    join pg_catalog.pg_roles owner_record
      on owner_record.oid = procedure_record.proowner
    where procedure_record.oid = any(array[
      'public.post_stock_receipt(jsonb)'::regprocedure,
      'public.post_stock_adjustment(jsonb)'::regprocedure,
      'public.post_stock_transfer(jsonb)'::regprocedure,
      'public.void_document(jsonb)'::regprocedure
    ])
      and procedure_record.prosecdef
      and procedure_record.proconfig = array['search_path=pg_catalog']::text[]
      and owner_record.rolname = 'postgres'
  ),
  4::bigint,
  'all inventory wrappers are postgres-owned fixed-path SECURITY DEFINER functions'
);

insert into public.businesses (
  id,
  legal_name,
  display_name,
  industry,
  owner_name
)
values
  (
    '11000000-0000-4000-8000-00000000b001',
    'Inventory Command One',
    'Inventory Command One',
    'retail',
    'Owner One'
  ),
  (
    '11000000-0000-4000-8000-00000000b002',
    'Inventory Command Two',
    'Inventory Command Two',
    'retail',
    'Owner Two'
  );

insert into public.warehouses (
  id,
  business_id,
  code,
  name,
  is_active
)
values
  (
    '31000000-0000-4000-8000-00000000b001',
    '11000000-0000-4000-8000-00000000b001',
    'ONE-A',
    'One A',
    true
  ),
  (
    '31000000-0000-4000-8000-00000000b002',
    '11000000-0000-4000-8000-00000000b001',
    'ONE-B',
    'One B',
    true
  ),
  (
    '31000000-0000-4000-8000-00000000b003',
    '11000000-0000-4000-8000-00000000b002',
    'TWO-A',
    'Two A',
    true
  );

insert into public.locations (
  id,
  business_id,
  code,
  name,
  type,
  warehouse_id,
  is_active
)
values
  (
    '41000000-0000-4000-8000-00000000b001',
    '11000000-0000-4000-8000-00000000b001',
    'LOC-A',
    'Location A',
    'warehouse',
    '31000000-0000-4000-8000-00000000b001',
    true
  ),
  (
    '41000000-0000-4000-8000-00000000b002',
    '11000000-0000-4000-8000-00000000b001',
    'LOC-B',
    'Location B',
    'warehouse',
    '31000000-0000-4000-8000-00000000b002',
    true
  ),
  (
    '41000000-0000-4000-8000-00000000b003',
    '11000000-0000-4000-8000-00000000b002',
    'LOC-C',
    'Location C',
    'warehouse',
    '31000000-0000-4000-8000-00000000b003',
    true
  );

insert into public.business_members (
  business_id,
  auth_user_id,
  role,
  access_scope,
  access_permissions,
  location_ids
)
values
  (
    '11000000-0000-4000-8000-00000000b001',
    '21000000-0000-4000-8000-00000000b001',
    'owner',
    'role',
    '{}',
    '{}'
  ),
  (
    '11000000-0000-4000-8000-00000000b001',
    '21000000-0000-4000-8000-00000000b002',
    'staff',
    'custom',
    array['inventory:manage'],
    array[
      '41000000-0000-4000-8000-00000000b001'::uuid,
      '41000000-0000-4000-8000-00000000b002'::uuid
    ]
  ),
  (
    '11000000-0000-4000-8000-00000000b001',
    '21000000-0000-4000-8000-00000000b003',
    'staff',
    'custom',
    array['inventory:manage'],
    array['41000000-0000-4000-8000-00000000b001'::uuid]
  ),
  (
    '11000000-0000-4000-8000-00000000b001',
    '21000000-0000-4000-8000-00000000b004',
    'finance_admin',
    'custom',
    array['accounting:write'],
    array[
      '41000000-0000-4000-8000-00000000b001'::uuid,
      '41000000-0000-4000-8000-00000000b002'::uuid
    ]
  ),
  (
    '11000000-0000-4000-8000-00000000b002',
    '21000000-0000-4000-8000-00000000b005',
    'owner',
    'role',
    '{}',
    '{}'
  );

insert into public.products (
  id,
  business_id,
  sku,
  name,
  unit,
  track_stock,
  purchase_price,
  selling_price,
  is_purchasable,
  is_active
)
values
  (
    '51000000-0000-4000-8000-00000000b001',
    '11000000-0000-4000-8000-00000000b001',
    'INV-ONE',
    'Inventory One',
    'pcs',
    true,
    50,
    75,
    true,
    true
  ),
  (
    '51000000-0000-4000-8000-00000000b002',
    '11000000-0000-4000-8000-00000000b002',
    'INV-TWO',
    'Inventory Two',
    'pcs',
    true,
    40,
    60,
    true,
    true
  );

insert into public.chart_of_accounts (
  business_id,
  code,
  name,
  type,
  normal_balance,
  category,
  is_system,
  is_active
)
values
  (
    '11000000-0000-4000-8000-00000000b001',
    '1200',
    'Inventory',
    'asset',
    'debit',
    'inventory',
    true,
    true
  ),
  (
    '11000000-0000-4000-8000-00000000b001',
    '6000',
    'Inventory Adjustment',
    'expense',
    'debit',
    'inventory_adjustment',
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
values (
  '61000000-0000-4000-8000-00000000b001',
  '11000000-0000-4000-8000-00000000b001',
  '51000000-0000-4000-8000-00000000b001',
  '31000000-0000-4000-8000-00000000b001',
  '2026-08-01',
  'purchase',
  20,
  1000,
  'Opening stock'
);

select set_config('request.jwt.claim.sub', '21000000-0000-4000-8000-00000000b002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"21000000-0000-4000-8000-00000000b002","role":"authenticated"}',
  true
);
set local role authenticated;

select throws_ok(
  $command$
    insert into public.stock_movements (
      business_id, item_id, warehouse_id, date, type, quantity, value
    ) values (
      '11000000-0000-4000-8000-00000000b001',
      '51000000-0000-4000-8000-00000000b001',
      '31000000-0000-4000-8000-00000000b001',
      '2026-08-21', 'purchase', 1, 50
    )
  $command$,
  '42501',
  'permission denied for table stock_movements',
  'authenticated cannot insert stock movements directly'
);

select throws_ok(
  $command$
    update public.stock_movements
    set quantity = 999
    where id = '61000000-0000-4000-8000-00000000b001'
  $command$,
  '42501',
  'permission denied for table stock_movements',
  'authenticated cannot update stock movements directly'
);

select throws_ok(
  $command$
    delete from public.stock_movements
    where id = '61000000-0000-4000-8000-00000000b001'
  $command$,
  '42501',
  'permission denied for table stock_movements',
  'authenticated cannot delete stock movements directly'
);

select throws_ok(
  $command$
    insert into public.stock_adjustments (
      business_id, adjustment_no, date, item_id, warehouse_id,
      quantity, value, reason, status
    ) values (
      '11000000-0000-4000-8000-00000000b001', 'RAW-ADJ', '2026-08-21',
      '51000000-0000-4000-8000-00000000b001',
      '31000000-0000-4000-8000-00000000b001', 1, 50, 'raw', 'posted'
    )
  $command$,
  '42501',
  'permission denied for table stock_adjustments',
  'authenticated cannot insert stock adjustments directly'
);

select throws_ok(
  $command$
    update public.stock_adjustments set status = 'void' where false
  $command$,
  '42501',
  'permission denied for table stock_adjustments',
  'authenticated cannot update stock adjustments directly'
);

select throws_ok(
  $command$
    delete from public.stock_adjustments where false
  $command$,
  '42501',
  'permission denied for table stock_adjustments',
  'authenticated cannot delete stock adjustments directly'
);

select throws_ok(
  $command$
    insert into public.stock_transfers (
      business_id, transfer_no, date, item_id, from_warehouse_id,
      to_warehouse_id, quantity, status
    ) values (
      '11000000-0000-4000-8000-00000000b001', 'RAW-TRF', '2026-08-21',
      '51000000-0000-4000-8000-00000000b001',
      '31000000-0000-4000-8000-00000000b001',
      '31000000-0000-4000-8000-00000000b002', 1, 'posted'
    )
  $command$,
  '42501',
  'permission denied for table stock_transfers',
  'authenticated cannot insert stock transfers directly'
);

select throws_ok(
  $command$
    update public.stock_transfers set quantity = 999 where false
  $command$,
  '42501',
  'permission denied for table stock_transfers',
  'authenticated cannot update stock transfers directly'
);

select throws_ok(
  $command$
    delete from public.stock_transfers where false
  $command$,
  '42501',
  'permission denied for table stock_transfers',
  'authenticated cannot delete stock transfers directly'
);

reset role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

create temporary table inventory_command_ids (
  command_name text primary key,
  document_id uuid not null
) on commit drop;

grant select, insert on pg_temp.inventory_command_ids to service_role;
set local role service_role;

select throws_ok(
  $command$
    select public.post_stock_adjustment(
      '{
        "businessId":"11000000-0000-4000-8000-00000000b001",
        "itemId":"51000000-0000-4000-8000-00000000b001",
        "warehouseId":"31000000-0000-4000-8000-00000000b001",
        "date":"2026-08-10",
        "quantity":1,
        "value":50,
        "reason":"Denied adjustment",
        "actorUserId":"21000000-0000-4000-8000-00000000b004"
      }'::jsonb
    )
  $command$,
  '42501',
  'Actor lacks inventory:manage permission for this business.',
  'accounting-only actor cannot post an inventory adjustment'
);

select is(
  (
    select count(*)
    from public.stock_adjustments
    where business_id = '11000000-0000-4000-8000-00000000b001'
  ),
  0::bigint,
  'denied adjustment creates no header'
);

select throws_ok(
  $command$
    select public.post_stock_adjustment(
      '{
        "businessId":"11000000-0000-4000-8000-00000000b001",
        "itemId":"51000000-0000-4000-8000-00000000b001",
        "warehouseId":"31000000-0000-4000-8000-00000000b002",
        "date":"2026-08-10",
        "quantity":1,
        "value":50,
        "reason":"Wrong location",
        "actorUserId":"21000000-0000-4000-8000-00000000b003"
      }'::jsonb
    )
  $command$,
  '42501',
  'Actor is not assigned to this inventory warehouse.',
  'custom inventory actor cannot adjust an unassigned warehouse'
);

select is(
  (
    select count(*)
    from public.stock_adjustments
    where business_id = '11000000-0000-4000-8000-00000000b001'
  ),
  0::bigint,
  'unassigned-location adjustment creates no partial header'
);

select throws_ok(
  $command$
    select public.post_stock_adjustment(
      '{
        "businessId":"11000000-0000-4000-8000-00000000b002",
        "itemId":"51000000-0000-4000-8000-00000000b002",
        "warehouseId":"31000000-0000-4000-8000-00000000b003",
        "date":"2026-08-10",
        "quantity":1,
        "value":40,
        "reason":"Cross tenant",
        "actorUserId":"21000000-0000-4000-8000-00000000b002"
      }'::jsonb
    )
  $command$,
  '42501',
  'Actor lacks inventory:manage permission for this business.',
  'inventory command cannot cross tenant membership'
);

select lives_ok(
  $command$
    insert into pg_temp.inventory_command_ids (command_name, document_id)
    select 'adjustment', public.post_stock_adjustment(
      '{
        "businessId":"11000000-0000-4000-8000-00000000b001",
        "itemId":"51000000-0000-4000-8000-00000000b001",
        "warehouseId":"31000000-0000-4000-8000-00000000b001",
        "date":"2026-08-10",
        "quantity":2,
        "value":100,
        "reason":"Count correction",
        "actorUserId":"21000000-0000-4000-8000-00000000b002"
      }'::jsonb
    )
  $command$,
  'assigned custom inventory actor can post an adjustment command'
);

select ok(
  exists (
    select 1
    from public.stock_adjustments adjustment
    join pg_temp.inventory_command_ids command
      on command.command_name = 'adjustment'
      and command.document_id = adjustment.id
    join public.stock_movements movement
      on movement.journal_entry_id = adjustment.journal_entry_id
    join public.journal_entries journal
      on journal.id = adjustment.journal_entry_id
    where adjustment.business_id = '11000000-0000-4000-8000-00000000b001'
      and adjustment.status = 'posted'
      and adjustment.created_by = '21000000-0000-4000-8000-00000000b002'
      and movement.item_id = adjustment.item_id
      and movement.warehouse_id = adjustment.warehouse_id
      and movement.quantity = 2
      and movement.value = 100
      and journal.reference_id = adjustment.id
  ),
  'adjustment command keeps header, movement, and journal linked'
);

select ok(
  exists (
    select 1
    from public.stock_adjustments adjustment
    join public.journal_lines journal_line
      on journal_line.journal_entry_id = adjustment.journal_entry_id
    where adjustment.business_id = '11000000-0000-4000-8000-00000000b001'
    group by adjustment.id
    having count(*) = 2
      and sum(journal_line.debit) = sum(journal_line.credit)
      and sum(journal_line.debit) = 100
  ),
  'adjustment command creates a balanced journal'
);

select is(
  (
    select count(*)
    from public.activity_events
    where business_id = '11000000-0000-4000-8000-00000000b001'
      and action = 'stock adjustment'
      and actor_user_id = '21000000-0000-4000-8000-00000000b002'
  ),
  1::bigint,
  'adjustment command records the real actor'
);

select throws_ok(
  $command$
    select public.post_stock_transfer(
      '{
        "businessId":"11000000-0000-4000-8000-00000000b001",
        "itemId":"51000000-0000-4000-8000-00000000b001",
        "fromWarehouseId":"31000000-0000-4000-8000-00000000b001",
        "toWarehouseId":"31000000-0000-4000-8000-00000000b002",
        "date":"2026-08-11",
        "quantity":3,
        "memo":"Partial assignment",
        "actorUserId":"21000000-0000-4000-8000-00000000b003"
      }'::jsonb
    )
  $command$,
  '42501',
  'Actor is not assigned to every inventory warehouse in this transfer.',
  'transfer requires assignment to both warehouses'
);

select is(
  (
    select count(*)
    from public.stock_transfers
    where business_id = '11000000-0000-4000-8000-00000000b001'
  ),
  0::bigint,
  'denied transfer creates no header or paired movements'
);

select lives_ok(
  $command$
    insert into pg_temp.inventory_command_ids (command_name, document_id)
    select 'transfer', public.post_stock_transfer(
      '{
        "businessId":"11000000-0000-4000-8000-00000000b001",
        "itemId":"51000000-0000-4000-8000-00000000b001",
        "fromWarehouseId":"31000000-0000-4000-8000-00000000b001",
        "toWarehouseId":"31000000-0000-4000-8000-00000000b002",
        "date":"2026-08-11",
        "quantity":3,
        "memo":"Authorized transfer",
        "actorUserId":"21000000-0000-4000-8000-00000000b002"
      }'::jsonb
    )
  $command$,
  'assigned custom inventory actor can post a transfer command'
);

select ok(
  exists (
    select 1
    from public.stock_transfers transfer
    join pg_temp.inventory_command_ids command
      on command.command_name = 'transfer'
      and command.document_id = transfer.id
    join public.stock_movements movement
      on movement.business_id = transfer.business_id
      and movement.item_id = transfer.item_id
      and movement.date = transfer.date
      and movement.memo = transfer.transfer_no
    where transfer.status = 'posted'
      and transfer.created_by = '21000000-0000-4000-8000-00000000b002'
    group by transfer.id
    having count(*) = 2
      and count(*) filter (
        where movement.type = 'transfer_out'
          and movement.warehouse_id = transfer.from_warehouse_id
      ) = 1
      and count(*) filter (
        where movement.type = 'transfer_in'
          and movement.warehouse_id = transfer.to_warehouse_id
      ) = 1
  ),
  'transfer command creates one header and its paired warehouse movements'
);

select is(
  (
    select count(*)
    from public.activity_events
    where business_id = '11000000-0000-4000-8000-00000000b001'
      and action = 'stock transfer'
      and actor_user_id = '21000000-0000-4000-8000-00000000b002'
  ),
  1::bigint,
  'transfer command records the real actor'
);

select lives_ok(
  $command$
    select public.post_stock_receipt(
      '{
        "businessId":"11000000-0000-4000-8000-00000000b001",
        "itemId":"51000000-0000-4000-8000-00000000b001",
        "warehouseId":"31000000-0000-4000-8000-00000000b001",
        "operationKey":"71000000-0000-4000-8000-00000000b001",
        "date":"2026-08-12",
        "quantity":4,
        "unitCost":50,
        "memo":"Idempotent receipt",
        "actorName":"Inventory Operator",
        "actorUserId":"21000000-0000-4000-8000-00000000b002"
      }'::jsonb
    )
  $command$,
  'assigned custom inventory actor can post a stock receipt'
);

select is(
  (
    public.post_stock_receipt(
      '{
        "businessId":"11000000-0000-4000-8000-00000000b001",
        "itemId":"51000000-0000-4000-8000-00000000b001",
        "warehouseId":"31000000-0000-4000-8000-00000000b001",
        "operationKey":"71000000-0000-4000-8000-00000000b001",
        "date":"2026-08-12",
        "quantity":4,
        "unitCost":50,
        "memo":"Idempotent receipt",
        "actorName":"Inventory Operator",
        "actorUserId":"21000000-0000-4000-8000-00000000b002"
      }'::jsonb
    )->>'replayed'
  ),
  'true',
  'stock receipt retry returns the existing result'
);

select is(
  (
    select count(*)
    from public.stock_movements
    where business_id = '11000000-0000-4000-8000-00000000b001'
      and operation_key = '71000000-0000-4000-8000-00000000b001'
  ),
  1::bigint,
  'stock receipt replay leaves one movement'
);

select is(
  (
    select count(*)
    from public.activity_events
    where business_id = '11000000-0000-4000-8000-00000000b001'
      and action = 'stock receipt'
      and description like 'INV-ONE%'
  ),
  1::bigint,
  'stock receipt replay leaves one activity event'
);

select throws_ok(
  $command$
    select public.post_stock_receipt(
      '{
        "businessId":"11000000-0000-4000-8000-00000000b001",
        "itemId":"51000000-0000-4000-8000-00000000b001",
        "warehouseId":"31000000-0000-4000-8000-00000000b002",
        "operationKey":"71000000-0000-4000-8000-00000000b002",
        "date":"2026-08-12",
        "quantity":1,
        "unitCost":50,
        "actorName":"Partial Operator",
        "actorUserId":"21000000-0000-4000-8000-00000000b003"
      }'::jsonb
    )
  $command$,
  '42501',
  'Actor is not assigned to this inventory warehouse.',
  'stock receipt rejects an unassigned warehouse'
);

select throws_ok(
  $command$
    select public.post_stock_receipt(
      '{
        "businessId":"11000000-0000-4000-8000-00000000b002",
        "itemId":"51000000-0000-4000-8000-00000000b002",
        "warehouseId":"31000000-0000-4000-8000-00000000b003",
        "operationKey":"71000000-0000-4000-8000-00000000b003",
        "date":"2026-08-12",
        "quantity":1,
        "unitCost":40,
        "actorName":"Cross Tenant",
        "actorUserId":"21000000-0000-4000-8000-00000000b002"
      }'::jsonb
    )
  $command$,
  '42501',
  'You are not allowed to perform inventory:manage.',
  'stock receipt cannot cross tenant membership'
);

select throws_ok(
  $command$
    select public.void_document(
      jsonb_build_object(
        'businessId', '11000000-0000-4000-8000-00000000b001',
        'documentType', 'stock_adjustment',
        'documentId', (
          select document_id
          from pg_temp.inventory_command_ids
          where command_name = 'adjustment'
        ),
        'date', '2026-08-13',
        'reason', 'Accounting actor must not reverse inventory',
        'actorUserId', '21000000-0000-4000-8000-00000000b004'
      )
    )
  $command$,
  '42501',
  'Actor lacks inventory:manage permission for this business.',
  'accounting-only actor cannot reverse an inventory document'
);

select lives_ok(
  $command$
    select public.void_document(
      jsonb_build_object(
        'businessId', '11000000-0000-4000-8000-00000000b001',
        'documentType', 'stock_adjustment',
        'documentId', (
          select document_id
          from pg_temp.inventory_command_ids
          where command_name = 'adjustment'
        ),
        'date', '2026-08-13',
        'reason', 'Verified adjustment reversal',
        'actorUserId', '21000000-0000-4000-8000-00000000b002'
      )
    )
  $command$,
  'authorized inventory actor can reverse a stock adjustment'
);

select ok(
  exists (
    select 1
    from public.stock_adjustments adjustment
    join pg_temp.inventory_command_ids command
      on command.command_name = 'adjustment'
      and command.document_id = adjustment.id
    join public.journal_entries original
      on original.id = adjustment.journal_entry_id
    join public.journal_entries reversal
      on reversal.id = original.reversed_entry_id
    join public.stock_movements reverse_movement
      on reverse_movement.journal_entry_id = reversal.id
    where adjustment.status = 'void'
      and original.status = 'reversed'
      and reversal.source = 'reversal'
      and reverse_movement.type = 'adjustment_out'
      and reverse_movement.quantity = 2
      and reverse_movement.value = 100
  ),
  'adjustment reversal keeps status, journals, and opposite movement consistent'
);

select throws_ok(
  $command$
    select public.void_document(
      jsonb_build_object(
        'businessId', '11000000-0000-4000-8000-00000000b001',
        'documentType', 'stock_adjustment',
        'documentId', (
          select document_id
          from pg_temp.inventory_command_ids
          where command_name = 'adjustment'
        ),
        'date', '2026-08-13',
        'reason', 'Duplicate reversal',
        'actorUserId', '21000000-0000-4000-8000-00000000b002'
      )
    )
  $command$,
  '42501',
  'Inventory document is unavailable at an assigned warehouse.',
  'second adjustment reversal is rejected before duplicate effects'
);

select ok(
  (
    select count(*)
    from public.activity_events
    where business_id = '11000000-0000-4000-8000-00000000b001'
      and action = 'document voided'
      and description like 'stock_adjustment%'
  ) = 1
  and (
    select count(*)
    from public.journal_entries journal
    where journal.business_id = '11000000-0000-4000-8000-00000000b001'
      and journal.source = 'reversal'
      and journal.reference_id = (
        select document_id
        from pg_temp.inventory_command_ids
        where command_name = 'adjustment'
      )
  ) = 1,
  'adjustment reversal retry leaves one activity and one reversal journal'
);

select lives_ok(
  $command$
    select public.void_document(
      jsonb_build_object(
        'businessId', '11000000-0000-4000-8000-00000000b001',
        'documentType', 'stock_transfer',
        'documentId', (
          select document_id
          from pg_temp.inventory_command_ids
          where command_name = 'transfer'
        ),
        'date', '2026-08-14',
        'reason', 'Verified transfer reversal',
        'actorUserId', '21000000-0000-4000-8000-00000000b002'
      )
    )
  $command$,
  'authorized inventory actor can reverse a stock transfer'
);

select ok(
  exists (
    select 1
    from public.stock_transfers transfer
    join pg_temp.inventory_command_ids command
      on command.command_name = 'transfer'
      and command.document_id = transfer.id
    join public.stock_movements movement
      on movement.business_id = transfer.business_id
      and movement.item_id = transfer.item_id
      and movement.memo in (transfer.transfer_no, 'Void ' || transfer.transfer_no)
    where transfer.status = 'void'
    group by transfer.id
    having count(*) = 4
      and count(*) filter (where movement.type = 'transfer_out') = 2
      and count(*) filter (where movement.type = 'transfer_in') = 2
  ),
  'transfer reversal preserves the header and adds exactly one opposite pair'
);

select throws_ok(
  $command$
    select public.void_document(
      jsonb_build_object(
        'businessId', '11000000-0000-4000-8000-00000000b001',
        'documentType', 'stock_transfer',
        'documentId', (
          select document_id
          from pg_temp.inventory_command_ids
          where command_name = 'transfer'
        ),
        'date', '2026-08-14',
        'reason', 'Duplicate transfer reversal',
        'actorUserId', '21000000-0000-4000-8000-00000000b002'
      )
    )
  $command$,
  '42501',
  'Inventory document is unavailable at every assigned warehouse.',
  'second transfer reversal is rejected before duplicate effects'
);

select ok(
  (
    select count(*)
    from public.activity_events
    where business_id = '11000000-0000-4000-8000-00000000b001'
      and action = 'document voided'
      and description like 'stock_transfer%'
  ) = 1
  and (
    select count(*)
    from public.stock_movements movement
    join public.stock_transfers transfer
      on transfer.business_id = movement.business_id
      and transfer.item_id = movement.item_id
      and movement.memo in (transfer.transfer_no, 'Void ' || transfer.transfer_no)
    join pg_temp.inventory_command_ids command
      on command.command_name = 'transfer'
      and command.document_id = transfer.id
  ) = 4,
  'transfer reversal retry leaves one activity and one reversal pair'
);

reset role;

select * from finish();

rollback;
