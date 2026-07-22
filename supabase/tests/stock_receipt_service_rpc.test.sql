begin;

create extension if not exists pgtap with schema extensions;

select plan(68);

select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stock_movements'
      and column_name = 'operation_key'
      and data_type = 'uuid'
      and is_nullable = 'YES'
  ),
  'stock movement operation keys are nullable for legacy compatibility'
);

select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stock_movements'
      and column_name = 'operation_fingerprint'
      and data_type = 'text'
      and is_nullable = 'YES'
  ),
  'stock movement operation fingerprints are nullable for legacy compatibility'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint constraint_record
    where constraint_record.conrelid = 'public.stock_movements'::regclass
      and constraint_record.conname = 'stock_movements_operation_identity_pair_chk'
      and constraint_record.contype = 'c'
      and not constraint_record.convalidated
      and pg_catalog.pg_get_constraintdef(constraint_record.oid)
        ilike '%(operation_key IS NULL) = (operation_fingerprint IS NULL)%'
  ),
  'operation identity pairing is enforced for new rows without scanning legacy rows yet'
);

select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'stock_movements'
      and indexname = 'stock_movements_business_operation_key_uidx'
      and indexdef ilike '%unique index%'
      and indexdef ilike '%(business_id, operation_key)%'
      and indexdef ilike '%where (operation_key is not null)%'
  ),
  'operation keys have a business-scoped partial unique index'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.post_stock_receipt(jsonb)',
    'EXECUTE'
  )
  and exists (
    select 1
    from pg_catalog.pg_proc procedure_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    join pg_catalog.pg_roles owner_record
      on owner_record.oid = procedure_record.proowner
    where namespace_record.nspname = 'public'
      and procedure_record.oid = 'public.post_stock_receipt(jsonb)'::regprocedure
      and procedure_record.prosecdef
      and owner_record.rolname = 'postgres'
      and procedure_record.proconfig = array['search_path=pg_catalog']::text[]
      and not exists (
        select 1
        from pg_catalog.aclexplode(procedure_record.proacl) acl_record
        left join pg_catalog.pg_roles grantee_record
          on grantee_record.oid = acl_record.grantee
        where acl_record.privilege_type = 'EXECUTE'
          and (
            acl_record.grantee = 0
            or grantee_record.rolname not in ('postgres', 'service_role')
          )
      )
  ),
  'the postgres-owned SECURITY DEFINER wrapper has a safe path and only service-role EXECUTE'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.post_stock_receipt(jsonb)',
    'EXECUTE'
  ),
  'anon cannot execute the public stock receipt wrapper'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.post_stock_receipt(jsonb)',
    'EXECUTE'
  ),
  'authenticated cannot execute the public stock receipt wrapper directly'
);

select ok(
  not has_function_privilege(
    'service_role',
    'app_private.post_stock_receipt_internal(jsonb)',
    'EXECUTE'
  ),
  'the internal command is not an alternate service-role API entry point'
);

select ok(
  pg_get_functiondef(
    'app_private.post_stock_receipt_internal(jsonb)'::regprocedure
  ) ilike '%pg_advisory_xact_lock%'
  and pg_get_functiondef(
    'app_private.post_stock_receipt_internal(jsonb)'::regprocedure
  ) ilike '%hashtextextended%stock-receipt%operation_key%',
  'the command serializes concurrent calls by business and operation key'
);

select ok(
  pg_get_functiondef(
    'app_private.post_stock_receipt_internal(jsonb)'::regprocedure
  ) ilike '%pg_catalog.sha256%'
  and pg_get_functiondef(
    'app_private.post_stock_receipt_internal(jsonb)'::regprocedure
  ) ilike '%pg_catalog.convert_to%'
  and pg_get_functiondef(
    'app_private.post_stock_receipt_internal(jsonb)'::regprocedure
  ) ilike '%pg_catalog.encode%operation_fingerprint%',
  'the command fingerprints the normalized receipt request with SHA-256'
);

select ok(
  pg_get_functiondef(
    'app_private.post_stock_receipt_internal(jsonb)'::regprocedure
  ) ilike '%pg_advisory_xact_lock_shared%posting-period-dml-global%pg_advisory_xact_lock_shared%posting-period|%target_business_id%',
  'new receipts take the shared global ordering lock before the shared business posting-period lock'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_trigger trigger_record
    where trigger_record.tgrelid = 'public.stock_movements'::regclass
      and trigger_record.tgname = 'coordinate_stock_movement_posting_window'
      and not trigger_record.tgisinternal
  )
  and pg_get_functiondef(
    'app_private.lock_stock_movement_posting_window()'::regprocedure
  ) ilike '%pg_advisory_xact_lock_shared%posting-period-dml-global%pg_advisory_xact_lock_shared%posting-period|%first_business_id%',
  'legacy and command stock-movement writes take the shared global lock before business coordination'
);

select ok(
  pg_get_functiondef(
    'app_private.lock_report_period_posting_window()'::regprocedure
  ) ilike '%pg_try_advisory_xact_lock%posting-period-dml-global%55p03%pg_advisory_xact_lock%posting-period|%first_business_id%'
  and pg_get_functiondef(
    'app_private.lock_report_period_posting_window()'::regprocedure
  ) ilike '%old.business_id < new.business_id%second_business_id%',
  'period DML fail-fast acquires the global ordering lock before exclusive business locks'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_trigger trigger_record
    where trigger_record.tgrelid = 'public.report_periods'::regclass
      and trigger_record.tgname = 'lock_report_period_posting_window'
      and not trigger_record.tgisinternal
  )
  and pg_get_functiondef(
    'app_private.lock_report_period_posting_window()'::regprocedure
  ) ilike '%old.business_id < new.business_id%second_business_id%pg_advisory_xact_lock%',
  'all direct report-period DML locks one or both businesses in deterministic order'
);

select ok(
  not has_function_privilege(
    'service_role',
    'public.set_report_period_lock_internal(jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.set_report_period_lock_internal(jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.set_report_period_lock_internal(jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'app_private.lock_report_period_posting_window()',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'app_private.lock_report_period_posting_window()',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'app_private.lock_report_period_posting_window()',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'app_private.lock_stock_movement_posting_window()',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'app_private.lock_stock_movement_posting_window()',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'app_private.lock_stock_movement_posting_window()',
    'EXECUTE'
  ),
  'posting-window coordination internals expose no direct API execute path'
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
    '10000000-0000-4000-8000-00000000a001',
    'Stock Receipt Test A',
    'Stock Receipt Test A',
    'retail',
    'Owner A'
  ),
  (
    '10000000-0000-4000-8000-00000000b001',
    'Stock Receipt Test B',
    'Stock Receipt Test B',
    'retail',
    'Owner B'
  );

insert into public.business_members (
  business_id,
  auth_user_id,
  role,
  access_scope,
  access_permissions
)
values
  (
    '10000000-0000-4000-8000-00000000a001',
    '20000000-0000-4000-8000-00000000a001',
    'owner',
    'role',
    '{}'
  ),
  (
    '10000000-0000-4000-8000-00000000b001',
    '20000000-0000-4000-8000-00000000a001',
    'owner',
    'role',
    '{}'
  ),
  (
    '10000000-0000-4000-8000-00000000a001',
    '20000000-0000-4000-8000-00000000a002',
    'staff',
    'custom',
    '{}'
  ),
  (
    '10000000-0000-4000-8000-00000000a001',
    '20000000-0000-4000-8000-00000000a003',
    'staff',
    'custom',
    array['inventory:manage']
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
    '40000000-0000-4000-8000-00000000a001',
    '10000000-0000-4000-8000-00000000a001',
    'A-MAIN',
    'A Main',
    true
  ),
  (
    '40000000-0000-4000-8000-00000000a002',
    '10000000-0000-4000-8000-00000000a001',
    'A-INACTIVE',
    'A Inactive',
    false
  ),
  (
    '40000000-0000-4000-8000-00000000b001',
    '10000000-0000-4000-8000-00000000b001',
    'B-MAIN',
    'B Main',
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
    '30000000-0000-4000-8000-00000000a001',
    '10000000-0000-4000-8000-00000000a001',
    'VALID-A',
    'Valid A',
    'pcs',
    true,
    true,
    true
  ),
  (
    '30000000-0000-4000-8000-00000000a002',
    '10000000-0000-4000-8000-00000000a001',
    'INACTIVE-A',
    'Inactive A',
    'pcs',
    true,
    true,
    false
  ),
  (
    '30000000-0000-4000-8000-00000000a003',
    '10000000-0000-4000-8000-00000000a001',
    'NONSTOCK-A',
    'Non-stock A',
    'pcs',
    false,
    true,
    true
  ),
  (
    '30000000-0000-4000-8000-00000000a004',
    '10000000-0000-4000-8000-00000000a001',
    'NONPURCHASE-A',
    'Non-purchasable A',
    'pcs',
    true,
    false,
    true
  ),
  (
    '30000000-0000-4000-8000-00000000a005',
    '10000000-0000-4000-8000-00000000a001',
    'ATOMIC-FAIL',
    'Atomic Failure A',
    'pcs',
    true,
    true,
    true
  ),
  (
    '30000000-0000-4000-8000-00000000b001',
    '10000000-0000-4000-8000-00000000b001',
    'VALID-B',
    'Valid B',
    'pcs',
    true,
    true,
    true
  );

select set_config('request.jwt.claim.role', 'service_role', true);
select set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  true
);

create temporary table stock_receipt_command_results (
  result_kind text primary key,
  response jsonb not null
) on commit drop;

grant select, insert on pg_temp.stock_receipt_command_results to service_role;
set local role service_role;

insert into pg_temp.stock_receipt_command_results (result_kind, response)
select
  'created',
  public.post_stock_receipt(
    '{
      "businessId":"10000000-0000-4000-8000-00000000a001",
      "itemId":"30000000-0000-4000-8000-00000000a001",
      "warehouseId":"40000000-0000-4000-8000-00000000a001",
      "operationKey":"50000000-0000-4000-8000-00000000a001",
      "date":"2026-07-19",
      "quantity":2,
      "unitCost":12500,
      "memo":"Penerimaan manual",
      "actorName":"Owner Test",
      "actorUserId":"20000000-0000-4000-8000-00000000a001"
    }'::jsonb
  );

select is(
  (
    select response->>'created'
    from pg_temp.stock_receipt_command_results
    where result_kind = 'created'
  ),
  'true',
  'the first command reports a created movement'
);

select is(
  (
    select response->>'replayed'
    from pg_temp.stock_receipt_command_results
    where result_kind = 'created'
  ),
  'false',
  'the first command is not marked as a replay'
);

select is(
  (
    select response->'movement'
    from pg_temp.stock_receipt_command_results
    where result_kind = 'created'
  ),
  (
    select jsonb_build_object(
      'id', movement.id,
      'businessId', movement.business_id,
      'itemId', movement.item_id,
      'warehouseId', movement.warehouse_id,
      'date', movement.date,
      'type', movement.type,
      'quantity', movement.quantity,
      'value', movement.value,
      'memo', movement.memo
    )
    from public.stock_movements movement
    where movement.business_id = '10000000-0000-4000-8000-00000000a001'
      and movement.operation_key = '50000000-0000-4000-8000-00000000a001'
  ),
  'a created command returns the authoritative persisted movement'
);

select is(
  (
    select count(*)
    from public.stock_movements
    where business_id = '10000000-0000-4000-8000-00000000a001'
      and operation_key = '50000000-0000-4000-8000-00000000a001'
  ),
  1::bigint,
  'the first command inserts exactly one movement'
);

select ok(
  (
    select operation_fingerprint ~ '^[0-9a-f]{64}$'
    from public.stock_movements
    where business_id = '10000000-0000-4000-8000-00000000a001'
      and operation_key = '50000000-0000-4000-8000-00000000a001'
  ),
  'the command persists a lowercase SHA-256 request fingerprint'
);

select is(
  (
    select count(*)
    from public.activity_events
    where business_id = '10000000-0000-4000-8000-00000000a001'
      and action = 'stock receipt'
      and description like 'VALID-A%'
  ),
  1::bigint,
  'the first command inserts exactly one activity event'
);

select is(
  (
    select actor_user_id::text
    from public.activity_events
    where business_id = '10000000-0000-4000-8000-00000000a001'
      and action = 'stock receipt'
      and description like 'VALID-A%'
  ),
  '20000000-0000-4000-8000-00000000a001',
  'the activity event attributes the server-injected actor UUID'
);

select is(
  (
    select actor_name
    from public.activity_events
    where business_id = '10000000-0000-4000-8000-00000000a001'
      and action = 'stock receipt'
      and description like 'VALID-A%'
  ),
  'Owner Test',
  'the activity event stores the server-derived display name'
);

select ok(
  (
    select journal_entry_id is null
    from public.stock_movements
    where business_id = '10000000-0000-4000-8000-00000000a001'
      and operation_key = '50000000-0000-4000-8000-00000000a001'
  ),
  'manual receipt preserves the legacy no-journal accounting behavior'
);

select is(
  (
    select actor_user_id::text
    from public.audit_logs
    where table_name = 'stock_movements'
      and after_data->>'operation_key' = '50000000-0000-4000-8000-00000000a001'
  ),
  '20000000-0000-4000-8000-00000000a001',
  'the automatic row audit also attributes the injected actor'
);

insert into pg_temp.stock_receipt_command_results (result_kind, response)
select
  'replayed',
  public.post_stock_receipt(
    '{
      "businessId":"10000000-0000-4000-8000-00000000a001",
      "itemId":"30000000-0000-4000-8000-00000000a001",
      "warehouseId":"40000000-0000-4000-8000-00000000a001",
      "operationKey":"50000000-0000-4000-8000-00000000a001",
      "date":"2026-07-19",
      "quantity":2.00001,
      "unitCost":12500,
      "memo":"  Penerimaan manual  ",
      "actorName":"Owner Test",
      "actorUserId":"20000000-0000-4000-8000-00000000a001"
    }'::jsonb
  );

select is(
  (
    select response->>'created'
    from pg_temp.stock_receipt_command_results
    where result_kind = 'replayed'
  ),
  'false',
  'an idempotent replay is not marked as newly created'
);

select is(
  (
    select response->>'replayed'
    from pg_temp.stock_receipt_command_results
    where result_kind = 'replayed'
  ),
  'true',
  'an idempotent replay is marked explicitly'
);

select is(
  (
    select response->>'movementId'
    from pg_temp.stock_receipt_command_results
    where result_kind = 'replayed'
  ),
  (
    select id::text
    from public.stock_movements
    where business_id = '10000000-0000-4000-8000-00000000a001'
      and operation_key = '50000000-0000-4000-8000-00000000a001'
  ),
  'an equivalent normalized request replays the original movement'
);

select is(
  (
    select response->'movement'
    from pg_temp.stock_receipt_command_results
    where result_kind = 'replayed'
  ),
  (
    select response->'movement'
    from pg_temp.stock_receipt_command_results
    where result_kind = 'created'
  ),
  'a replay returns the same authoritative movement payload'
);

select is(
  (
    select count(*)
    from public.stock_movements
    where business_id = '10000000-0000-4000-8000-00000000a001'
      and operation_key = '50000000-0000-4000-8000-00000000a001'
  ),
  1::bigint,
  'replay leaves exactly one movement'
);

select is(
  (
    select count(*)
    from public.activity_events
    where business_id = '10000000-0000-4000-8000-00000000a001'
      and action = 'stock receipt'
      and description like 'VALID-A%'
  ),
  1::bigint,
  'replay leaves exactly one activity event'
);

select throws_ok(
  $command$
    select public.post_stock_receipt(
      '{
        "businessId":"10000000-0000-4000-8000-00000000a001",
        "itemId":"30000000-0000-4000-8000-00000000a001",
        "warehouseId":"40000000-0000-4000-8000-00000000a001",
        "operationKey":"50000000-0000-4000-8000-00000000a001",
        "date":"2026-07-19",
        "quantity":3,
        "unitCost":12500,
        "memo":"Penerimaan manual",
        "actorName":"Owner Test",
        "actorUserId":"20000000-0000-4000-8000-00000000a001"
      }'::jsonb
    )
  $command$,
  '23505',
  'Idempotency key was already used for a different stock receipt.',
  'conflicting reuse of an operation key is rejected'
);

select is(
  (
    select count(*)
    from public.stock_movements
    where business_id = '10000000-0000-4000-8000-00000000a001'
      and operation_key = '50000000-0000-4000-8000-00000000a001'
  ) + (
    select count(*)
    from public.activity_events
    where business_id = '10000000-0000-4000-8000-00000000a001'
      and action = 'stock receipt'
      and description like 'VALID-A%'
  ),
  2::bigint,
  'a conflict does not add a movement or activity event'
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
  '70000000-0000-4000-8000-00000000a002',
  '10000000-0000-4000-8000-00000000a001',
  '30000000-0000-4000-8000-00000000a001',
  '40000000-0000-4000-8000-00000000a001',
  '2026-07-20',
  'purchase',
  1,
  100,
  'Legacy movement created before period close'
);

select lives_ok(
  $command$
    select public.post_stock_receipt(
      '{
        "businessId":"10000000-0000-4000-8000-00000000b001",
        "itemId":"30000000-0000-4000-8000-00000000b001",
        "warehouseId":"40000000-0000-4000-8000-00000000b001",
        "operationKey":"50000000-0000-4000-8000-00000000a001",
        "date":"2026-08-01",
        "quantity":1,
        "unitCost":100,
        "actorName":"Owner Test",
        "actorUserId":"20000000-0000-4000-8000-00000000a001"
      }'::jsonb
    )
  $command$,
  'the same operation UUID remains valid in another business'
);

select lives_ok(
  $command$
    select public.post_stock_receipt(
      '{
        "businessId":"10000000-0000-4000-8000-00000000a001",
        "itemId":"30000000-0000-4000-8000-00000000a001",
        "warehouseId":"40000000-0000-4000-8000-00000000a001",
        "operationKey":"50000000-0000-4000-8000-00000000a002",
        "date":"2026-08-01",
        "quantity":1,
        "unitCost":100,
        "actorName":"Custom Inventory Staff",
        "actorUserId":"20000000-0000-4000-8000-00000000a003"
      }'::jsonb
    )
  $command$,
  'a custom member with inventory:manage can post a receipt'
);

select throws_ok(
  $command$
    select public.post_stock_receipt(
      '{
        "businessId":"10000000-0000-4000-8000-00000000a001",
        "itemId":"30000000-0000-4000-8000-00000000a001",
        "warehouseId":"40000000-0000-4000-8000-00000000a001",
        "operationKey":"50000000-0000-4000-8000-00000000a003",
        "date":"2026-08-01",
        "quantity":1,
        "unitCost":100,
        "actorName":"Denied Staff",
        "actorUserId":"20000000-0000-4000-8000-00000000a002"
      }'::jsonb
    )
  $command$,
  '42501',
  'You are not allowed to perform inventory:manage.',
  'a custom member without inventory:manage is denied'
);

select throws_ok(
  $command$
    select public.post_stock_receipt(
      '{
        "businessId":"10000000-0000-4000-8000-00000000a001",
        "itemId":"30000000-0000-4000-8000-00000000a001",
        "warehouseId":"40000000-0000-4000-8000-00000000a001",
        "operationKey":"50000000-0000-4000-8000-00000000a004",
        "date":"2026-08-01",
        "quantity":1,
        "unitCost":100,
        "actorName":"Non Member",
        "actorUserId":"20000000-0000-4000-8000-00000000afff"
      }'::jsonb
    )
  $command$,
  '42501',
  'You are not allowed to perform inventory:manage.',
  'a non-member is denied by the database command boundary'
);

insert into public.report_periods (
  business_id,
  label,
  start_date,
  end_date,
  locked
)
values (
  '10000000-0000-4000-8000-00000000a001',
  'Locked July 2026',
  '2026-07-01',
  '2026-07-31',
  true
);

select is(
  (
    public.post_stock_receipt(
      '{
        "businessId":"10000000-0000-4000-8000-00000000a001",
        "itemId":"30000000-0000-4000-8000-00000000a001",
        "warehouseId":"40000000-0000-4000-8000-00000000a001",
        "operationKey":"50000000-0000-4000-8000-00000000a001",
        "date":"2026-07-19",
        "quantity":2,
        "unitCost":12500,
        "memo":"Penerimaan manual",
        "actorName":"Owner Test",
        "actorUserId":"20000000-0000-4000-8000-00000000a001"
      }'::jsonb
    )->>'replayed'
  ),
  'true',
  'a completed command can still be confirmed after its period is locked'
);

select throws_ok(
  $command$
    select public.post_stock_receipt(
      '{
        "businessId":"10000000-0000-4000-8000-00000000a001",
        "itemId":"30000000-0000-4000-8000-00000000a001",
        "warehouseId":"40000000-0000-4000-8000-00000000a001",
        "operationKey":"50000000-0000-4000-8000-00000000a005",
        "date":"2026-07-20",
        "quantity":1,
        "unitCost":100,
        "actorName":"Owner Test",
        "actorUserId":"20000000-0000-4000-8000-00000000a001"
      }'::jsonb
    )
  $command$,
  '55000',
  'Period is locked. Use a correction or reversal entry.',
  'new receipts cannot post into a locked period'
);

select throws_ok(
  $command$
    select public.post_stock_receipt(
      '{
        "businessId":"10000000-0000-4000-8000-00000000a001",
        "itemId":"30000000-0000-4000-8000-00000000a002",
        "warehouseId":"40000000-0000-4000-8000-00000000a001",
        "operationKey":"50000000-0000-4000-8000-00000000a006",
        "date":"2026-08-01",
        "quantity":1,
        "unitCost":100,
        "actorName":"Owner Test",
        "actorUserId":"20000000-0000-4000-8000-00000000a001"
      }'::jsonb
    )
  $command$,
  '23503',
  'Stock product was not found, is inactive, or is not purchasable.',
  'inactive products are rejected'
);

select throws_ok(
  $command$
    select public.post_stock_receipt(
      '{
        "businessId":"10000000-0000-4000-8000-00000000a001",
        "itemId":"30000000-0000-4000-8000-00000000a003",
        "warehouseId":"40000000-0000-4000-8000-00000000a001",
        "operationKey":"50000000-0000-4000-8000-00000000a007",
        "date":"2026-08-01",
        "quantity":1,
        "unitCost":100,
        "actorName":"Owner Test",
        "actorUserId":"20000000-0000-4000-8000-00000000a001"
      }'::jsonb
    )
  $command$,
  '23503',
  'Stock product was not found, is inactive, or is not purchasable.',
  'non-stock products are rejected'
);

select throws_ok(
  $command$
    select public.post_stock_receipt(
      '{
        "businessId":"10000000-0000-4000-8000-00000000a001",
        "itemId":"30000000-0000-4000-8000-00000000a004",
        "warehouseId":"40000000-0000-4000-8000-00000000a001",
        "operationKey":"50000000-0000-4000-8000-00000000a008",
        "date":"2026-08-01",
        "quantity":1,
        "unitCost":100,
        "actorName":"Owner Test",
        "actorUserId":"20000000-0000-4000-8000-00000000a001"
      }'::jsonb
    )
  $command$,
  '23503',
  'Stock product was not found, is inactive, or is not purchasable.',
  'non-purchasable products are rejected'
);

select throws_ok(
  $command$
    select public.post_stock_receipt(
      '{
        "businessId":"10000000-0000-4000-8000-00000000a001",
        "itemId":"30000000-0000-4000-8000-00000000b001",
        "warehouseId":"40000000-0000-4000-8000-00000000a001",
        "operationKey":"50000000-0000-4000-8000-00000000a009",
        "date":"2026-08-01",
        "quantity":1,
        "unitCost":100,
        "actorName":"Owner Test",
        "actorUserId":"20000000-0000-4000-8000-00000000a001"
      }'::jsonb
    )
  $command$,
  '23503',
  'Stock product was not found, is inactive, or is not purchasable.',
  'cross-tenant products are rejected'
);

select throws_ok(
  $command$
    select public.post_stock_receipt(
      '{
        "businessId":"10000000-0000-4000-8000-00000000a001",
        "itemId":"30000000-0000-4000-8000-00000000a001",
        "warehouseId":"40000000-0000-4000-8000-00000000a002",
        "operationKey":"50000000-0000-4000-8000-00000000a010",
        "date":"2026-08-01",
        "quantity":1,
        "unitCost":100,
        "actorName":"Owner Test",
        "actorUserId":"20000000-0000-4000-8000-00000000a001"
      }'::jsonb
    )
  $command$,
  '23503',
  'Warehouse was not found or is inactive.',
  'inactive warehouses are rejected'
);

select throws_ok(
  $command$
    select public.post_stock_receipt(
      '{
        "businessId":"10000000-0000-4000-8000-00000000a001",
        "itemId":"30000000-0000-4000-8000-00000000a001",
        "warehouseId":"40000000-0000-4000-8000-00000000b001",
        "operationKey":"50000000-0000-4000-8000-00000000a011",
        "date":"2026-08-01",
        "quantity":1,
        "unitCost":100,
        "actorName":"Owner Test",
        "actorUserId":"20000000-0000-4000-8000-00000000a001"
      }'::jsonb
    )
  $command$,
  '23503',
  'Warehouse was not found or is inactive.',
  'cross-tenant warehouses are rejected'
);

select throws_ok(
  $command$
    select public.post_stock_receipt(
      '{
        "businessId":"10000000-0000-4000-8000-00000000a001",
        "itemId":"30000000-0000-4000-8000-00000000a001",
        "warehouseId":"40000000-0000-4000-8000-00000000a001",
        "operationKey":"50000000-0000-4000-8000-00000000a012",
        "date":"2026-08-01",
        "quantity":0,
        "unitCost":100,
        "actorName":"Owner Test",
        "actorUserId":"20000000-0000-4000-8000-00000000a001"
      }'::jsonb
    )
  $command$,
  '22023',
  'Stock receipt quantity must be positive and safely representable at four decimals.',
  'zero quantity is rejected'
);

select throws_ok(
  $command$
    select public.post_stock_receipt(
      '{
        "businessId":"10000000-0000-4000-8000-00000000a001",
        "itemId":"30000000-0000-4000-8000-00000000a001",
        "warehouseId":"40000000-0000-4000-8000-00000000a001",
        "operationKey":"50000000-0000-4000-8000-00000000a019",
        "date":"2026-08-01",
        "quantity":900719925474.0992,
        "unitCost":1,
        "actorName":"Owner Test",
        "actorUserId":"20000000-0000-4000-8000-00000000a001"
      }'::jsonb
    )
  $command$,
  '22023',
  'Stock receipt quantity must be positive and safely representable at four decimals.',
  'quantities outside JavaScript-safe four-decimal precision are rejected'
);

select throws_ok(
  $command$
    select public.post_stock_receipt(
      '{
        "businessId":"10000000-0000-4000-8000-00000000a001",
        "itemId":"30000000-0000-4000-8000-00000000a001",
        "warehouseId":"40000000-0000-4000-8000-00000000a001",
        "operationKey":"50000000-0000-4000-8000-00000000a013",
        "date":"2026-08-01",
        "quantity":1,
        "unitCost":-1,
        "actorName":"Owner Test",
        "actorUserId":"20000000-0000-4000-8000-00000000a001"
      }'::jsonb
    )
  $command$,
  '22023',
  'Stock receipt unit cost must be zero or positive.',
  'negative unit cost is rejected'
);

select throws_ok(
  $command$
    select public.post_stock_receipt(
      '{
        "businessId":"10000000-0000-4000-8000-00000000a001",
        "itemId":"30000000-0000-4000-8000-00000000a001",
        "warehouseId":"40000000-0000-4000-8000-00000000a001",
        "operationKey":"50000000-0000-4000-8000-00000000a018",
        "date":"2026-08-01",
        "quantity":1,
        "unitCost":-0.001,
        "actorName":"Owner Test",
        "actorUserId":"20000000-0000-4000-8000-00000000a001"
      }'::jsonb
    )
  $command$,
  '22023',
  'Stock receipt unit cost must be zero or positive.',
  'a sub-cent negative unit cost is rejected before normalization'
);

select throws_ok(
  $command$
    select public.post_stock_receipt(
      '{
        "businessId":"10000000-0000-4000-8000-00000000a001",
        "itemId":"30000000-0000-4000-8000-00000000a001",
        "warehouseId":"40000000-0000-4000-8000-00000000a001",
        "operationKey":"50000000-0000-4000-8000-00000000a014",
        "date":"2026-02-30",
        "quantity":1,
        "unitCost":100,
        "actorName":"Owner Test",
        "actorUserId":"20000000-0000-4000-8000-00000000a001"
      }'::jsonb
    )
  $command$,
  '22023',
  'Stock receipt contains an invalid UUID, date, or number.',
  'calendar-invalid dates are rejected'
);

select throws_ok(
  $command$
    select public.post_stock_receipt(
      jsonb_build_object(
        'businessId', '10000000-0000-4000-8000-00000000a001',
        'itemId', '30000000-0000-4000-8000-00000000a001',
        'warehouseId', '40000000-0000-4000-8000-00000000a001',
        'operationKey', '50000000-0000-4000-8000-00000000a015',
        'date', '2026-08-01',
        'quantity', 1,
        'unitCost', 100,
        'memo', repeat('x', 501),
        'actorName', 'Owner Test',
        'actorUserId', '20000000-0000-4000-8000-00000000a001'
      )
    )
  $command$,
  '22023',
  'Stock receipt memo cannot exceed 500 characters.',
  'overlong memos are rejected'
);

select throws_ok(
  $command$
    select public.post_stock_receipt(
      '{
        "businessId":"10000000-0000-4000-8000-00000000a001",
        "itemId":"30000000-0000-4000-8000-00000000a001",
        "warehouseId":"40000000-0000-4000-8000-00000000a001",
        "operationKey":"50000000-0000-4000-8000-00000000a016",
        "date":"2026-08-01",
        "quantity":2,
        "unitCost":5000000000000000,
        "actorName":"Owner Test",
        "actorUserId":"20000000-0000-4000-8000-00000000a001"
      }'::jsonb
    )
  $command$,
  '22003',
  'Stock receipt value must fit numeric(18,2).',
  'numeric(18,2) overflow is rejected before insert'
);

select lives_ok(
  $command$
    select public.post_stock_receipt(
      '{
        "businessId":"10000000-0000-4000-8000-00000000a001",
        "itemId":"30000000-0000-4000-8000-00000000a001",
        "warehouseId":"40000000-0000-4000-8000-00000000a001",
        "operationKey":"50000000-0000-4000-8000-00000000a017",
        "date":"2026-08-01",
        "quantity":0.0001,
        "unitCost":1,
        "actorName":"Owner Test",
        "actorUserId":"20000000-0000-4000-8000-00000000a001"
      }'::jsonb
    )
  $command$,
  'a small-quantity receipt establishes the unit-cost fingerprint case'
);

select throws_ok(
  $command$
    select public.post_stock_receipt(
      '{
        "businessId":"10000000-0000-4000-8000-00000000a001",
        "itemId":"30000000-0000-4000-8000-00000000a001",
        "warehouseId":"40000000-0000-4000-8000-00000000a001",
        "operationKey":"50000000-0000-4000-8000-00000000a017",
        "date":"2026-08-01",
        "quantity":0.0001,
        "unitCost":49,
        "actorName":"Owner Test",
        "actorUserId":"20000000-0000-4000-8000-00000000a001"
      }'::jsonb
    )
  $command$,
  '23505',
  'Idempotency key was already used for a different stock receipt.',
  'different normalized unit costs conflict even when rounded movement value matches'
);

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-4000-8000-00000000a001',
  true
);
select set_config(
  'request.jwt.claims',
  '{
    "role":"authenticated",
    "sub":"20000000-0000-4000-8000-00000000a001"
  }',
  true
);
set local role authenticated;

select throws_ok(
  $command$
    delete from public.stock_movements
    where id = '70000000-0000-4000-8000-00000000a002'
  $command$,
  '55000',
  'Period is locked. Use a correction or reversal entry.',
  'legacy rows cannot be deleted from a locked period'
);

select throws_ok(
  $command$
    update public.stock_movements
    set date = '2026-08-02'
    where id = '70000000-0000-4000-8000-00000000a002'
  $command$,
  '55000',
  'Period is locked. Use a correction or reversal entry.',
  'legacy rows cannot be moved out of a locked old period'
);

select throws_ok(
  $command$
    insert into public.stock_movements (
      business_id,
      item_id,
      warehouse_id,
      date,
      type,
      quantity,
      value,
      operation_key
    )
    values (
      '10000000-0000-4000-8000-00000000a001',
      '30000000-0000-4000-8000-00000000a001',
      '40000000-0000-4000-8000-00000000a001',
      '2026-08-01',
      'purchase',
      1,
      100,
      '50000000-0000-4000-8000-00000000a990'
    )
  $command$,
  '42501',
  'operation_key and operation_fingerprint can only be assigned by the stock receipt command.',
  'authenticated direct DML cannot poison an operation key'
);

select throws_ok(
  $command$
    insert into public.stock_movements (
      business_id,
      item_id,
      warehouse_id,
      date,
      type,
      quantity,
      value,
      operation_fingerprint
    )
    values (
      '10000000-0000-4000-8000-00000000a001',
      '30000000-0000-4000-8000-00000000a001',
      '40000000-0000-4000-8000-00000000a001',
      '2026-08-01',
      'purchase',
      1,
      100,
      repeat('a', 64)
    )
  $command$,
  '42501',
  'operation_key and operation_fingerprint can only be assigned by the stock receipt command.',
  'authenticated direct DML cannot poison an operation fingerprint'
);

select lives_ok(
  $command$
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
      '70000000-0000-4000-8000-00000000a001',
      '10000000-0000-4000-8000-00000000a001',
      '30000000-0000-4000-8000-00000000a001',
      '40000000-0000-4000-8000-00000000a001',
      '2026-08-01',
      'purchase',
      1,
      100,
      'Legacy NULL-key movement'
    )
  $command$,
  'authenticated legacy inserts remain compatible when operation_key is NULL'
);

select throws_ok(
  $command$
    update public.stock_movements
    set operation_key = '50000000-0000-4000-8000-00000000a991'
    where id = '70000000-0000-4000-8000-00000000a001'
  $command$,
  '42501',
  'Command-owned stock movements are immutable.',
  'authenticated DML cannot attach an operation key later'
);

select throws_ok(
  $command$
    update public.stock_movements
    set memo = 'tampered'
    where business_id = '10000000-0000-4000-8000-00000000a001'
      and operation_key = '50000000-0000-4000-8000-00000000a017'
  $command$,
  '42501',
  'Command-owned stock movements are immutable.',
  'authenticated DML cannot mutate a command-owned movement'
);

select throws_ok(
  $command$
    delete from public.stock_movements
    where business_id = '10000000-0000-4000-8000-00000000a001'
      and operation_key = '50000000-0000-4000-8000-00000000a017'
  $command$,
  '42501',
  'Command-owned stock movements cannot be deleted.',
  'authenticated DML cannot delete a command-owned movement'
);

reset role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  true
);

create or replace function app_private.fail_stock_receipt_activity_test()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if new.action = 'stock receipt'
    and new.description like 'ATOMIC-FAIL%'
  then
    raise exception 'forced activity failure';
  end if;

  return new;
end;
$$;

create trigger fail_stock_receipt_activity_test
before insert on public.activity_events
for each row execute function app_private.fail_stock_receipt_activity_test();

select throws_ok(
  $command$
    select public.post_stock_receipt(
      '{
        "businessId":"10000000-0000-4000-8000-00000000a001",
        "itemId":"30000000-0000-4000-8000-00000000a005",
        "warehouseId":"40000000-0000-4000-8000-00000000a001",
        "operationKey":"50000000-0000-4000-8000-00000000a999",
        "date":"2026-08-01",
        "quantity":1,
        "unitCost":100,
        "actorName":"Owner Test",
        "actorUserId":"20000000-0000-4000-8000-00000000a001"
      }'::jsonb
    )
  $command$,
  'P0001',
  'forced activity failure',
  'an activity failure aborts the stock receipt command'
);

select is(
  (
    select count(*)
    from public.stock_movements
    where operation_key = '50000000-0000-4000-8000-00000000a999'
  ),
  0::bigint,
  'activity failure rolls back the stock movement'
);

select is(
  (
    select count(*)
    from public.activity_events
    where business_id = '10000000-0000-4000-8000-00000000a001'
      and action = 'stock receipt'
      and description like 'ATOMIC-FAIL%'
  ),
  0::bigint,
  'activity failure leaves no partial activity event'
);

select is(
  (
    select count(*)
    from public.audit_logs
    where table_name = 'stock_movements'
      and after_data->>'operation_key' = '50000000-0000-4000-8000-00000000a999'
  ),
  0::bigint,
  'activity failure also rolls back the automatic row audit'
);

drop trigger fail_stock_receipt_activity_test on public.activity_events;
drop function app_private.fail_stock_receipt_activity_test();

select ok(
  (
    select operation_key is null
      and operation_fingerprint is null
    from public.stock_movements
    where id = '70000000-0000-4000-8000-00000000a001'
  ),
  'legacy direct DML never acquires a command operation identity'
);

select is(
  (
    select count(*)
    from public.journal_entries
    where business_id = '10000000-0000-4000-8000-00000000a001'
  ),
  0::bigint,
  'the stock receipt command does not silently add accounting journals'
);

select * from finish();

rollback;
