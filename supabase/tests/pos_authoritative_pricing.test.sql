begin;

create extension if not exists pgtap with schema extensions;

select plan(18);

select is(
  current_user::text,
  'postgres',
  'POS authoritative-pricing rehearsal runs as postgres'
);

select ok(
  has_function_privilege('service_role', 'public.post_pos_sale_v2(jsonb)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.post_pos_sale_v2(jsonb)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.post_pos_sale_v2(jsonb)', 'EXECUTE')
  and exists (
    select 1
    from pg_catalog.pg_proc procedure_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    join pg_catalog.pg_roles owner_record
      on owner_record.oid = procedure_record.proowner
    where procedure_record.oid = 'public.post_pos_sale_v2(jsonb)'::regprocedure
      and namespace_record.nspname = 'public'
      and owner_record.rolname = 'postgres'
      and procedure_record.prosecdef
      and procedure_record.proconfig = array['search_path=pg_catalog']::text[]
  ),
  'the versioned POS command is postgres-owned, service-only, and uses a safe path'
);

select ok(
  not has_function_privilege(
    'service_role',
    'public.post_pos_sale_internal(jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.post_pos_sale_internal(jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'app_private.lock_pos_sale_inventory_keys(jsonb)',
    'EXECUTE'
  ),
  'internal posting and pre-lock helpers expose no alternate API entry point'
);

select ok(
  pg_catalog.pg_get_functiondef(
    'app_private.lock_pos_sale_inventory_keys(jsonb)'::regprocedure
  ) not ilike '%line_item->>''unitPrice''%'
  and pg_catalog.pg_get_functiondef(
    'app_private.lock_pos_sale_inventory_keys(jsonb)'::regprocedure
  ) ilike '%line_product_id is null or qty is null or qty <= 0%'
  and pg_catalog.pg_get_functiondef(
    'app_private.lock_pos_sale_inventory_keys(jsonb)'::regprocedure
  ) ilike '%order by affected_item.item_id%'
  and pg_catalog.pg_get_functiondef(
    'app_private.lock_pos_sale_inventory_keys(jsonb)'::regprocedure
  ) ilike '%inventory-stock|%'
  ,
  'the canonical pre-lock validates identity and quantity but ignores caller price'
);

select ok(
  pg_catalog.pg_get_functiondef(
    'public.post_pos_sale_internal(jsonb)'::regprocedure
  ) ilike '%product.selling_price%'
  and pg_catalog.pg_get_functiondef(
    'public.post_pos_sale_internal(jsonb)'::regprocedure
  ) ilike '%for share of product%'
  and pg_catalog.pg_get_functiondef(
    'public.post_pos_sale_internal(jsonb)'::regprocedure
  ) ilike '%product_record.selling_price <= 0%'
  and pg_catalog.pg_get_functiondef(
    'public.post_pos_sale_internal(jsonb)'::regprocedure
  ) ilike '%resolved_items%unitPrice%unit_price%'
  ,
  'the posting transaction locks catalog rows and snapshots authoritative positive prices'
);

select ok(
  not has_function_privilege('authenticated', 'public.post_pos_sale_v2(jsonb)', 'EXECUTE'),
  'authenticated clients cannot bypass the application authorization boundary'
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
    '81000000-0000-4000-8000-000000000001',
    'POS Pricing Business A',
    'POS Pricing Business A',
    'retail',
    'Owner A'
  ),
  (
    '81000000-0000-4000-8000-000000000002',
    'POS Pricing Business B',
    'POS Pricing Business B',
    'retail',
    'Owner B'
  );

insert into public.business_members (
  business_id,
  auth_user_id,
  role,
  access_scope,
  access_permissions,
  location_ids
)
values (
  '81000000-0000-4000-8000-000000000001',
  '82000000-0000-4000-8000-000000000001',
  'owner',
  'role',
  '{}',
  '{}'
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
    '83000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000001',
    'POS-A',
    'POS Warehouse A',
    true
  ),
  (
    '83000000-0000-4000-8000-000000000002',
    '81000000-0000-4000-8000-000000000002',
    'POS-B',
    'POS Warehouse B',
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
    '84000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000001',
    'STORE-A',
    'Store A',
    'store',
    '83000000-0000-4000-8000-000000000001',
    true
  ),
  (
    '84000000-0000-4000-8000-000000000002',
    '81000000-0000-4000-8000-000000000002',
    'STORE-B',
    'Store B',
    'store',
    '83000000-0000-4000-8000-000000000002',
    true
  );

insert into public.products (
  id,
  business_id,
  sku,
  name,
  unit,
  track_stock,
  selling_price,
  is_sellable,
  is_active
)
values
  (
    '85000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000001',
    'POS-GOOD-A',
    'Authoritative Product A',
    'pcs',
    false,
    25000,
    true,
    true
  ),
  (
    '85000000-0000-4000-8000-000000000002',
    '81000000-0000-4000-8000-000000000001',
    'POS-ZERO-A',
    'Zero Price Product A',
    'pcs',
    false,
    0,
    true,
    true
  ),
  (
    '85000000-0000-4000-8000-000000000003',
    '81000000-0000-4000-8000-000000000001',
    'POS-INACTIVE-A',
    'Inactive Product A',
    'pcs',
    false,
    25000,
    true,
    false
  ),
  (
    '85000000-0000-4000-8000-000000000004',
    '81000000-0000-4000-8000-000000000002',
    'POS-GOOD-B',
    'Cross Tenant Product B',
    'pcs',
    false,
    90000,
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
  ('81000000-0000-4000-8000-000000000001', '1000', 'Cash', 'asset', 'debit', 'cash', true, true),
  ('81000000-0000-4000-8000-000000000001', '1100', 'Receivables', 'asset', 'debit', 'receivable', true, true),
  ('81000000-0000-4000-8000-000000000001', '1200', 'Inventory', 'asset', 'debit', 'inventory', true, true),
  ('81000000-0000-4000-8000-000000000001', '4000', 'Revenue', 'revenue', 'credit', 'revenue', true, true),
  ('81000000-0000-4000-8000-000000000001', '5000', 'COGS', 'expense', 'debit', 'cogs', true, true);

select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

create temporary table pos_command_results (
  case_name text primary key,
  sale_id uuid not null
) on commit drop;

grant select, insert on pg_temp.pos_command_results to service_role;

set local role service_role;

insert into pg_temp.pos_command_results (case_name, sale_id)
values
  (
    'omitted',
    public.post_pos_sale_v2(
      '{
        "businessId":"81000000-0000-4000-8000-000000000001",
        "locationId":"84000000-0000-4000-8000-000000000001",
        "date":"2026-08-21",
        "paymentMethod":"cash",
        "items":[{"productId":"85000000-0000-4000-8000-000000000001","quantity":2}],
        "actorUserId":"82000000-0000-4000-8000-000000000001"
      }'::jsonb
    )
  ),
  (
    'zero',
    public.post_pos_sale_v2(
      '{
        "businessId":"81000000-0000-4000-8000-000000000001",
        "locationId":"84000000-0000-4000-8000-000000000001",
        "date":"2026-08-21",
        "paymentMethod":"cash",
        "items":[{"productId":"85000000-0000-4000-8000-000000000001","quantity":2,"unitPrice":0}],
        "actorUserId":"82000000-0000-4000-8000-000000000001"
      }'::jsonb
    )
  ),
  (
    'negative',
    public.post_pos_sale_v2(
      '{
        "businessId":"81000000-0000-4000-8000-000000000001",
        "locationId":"84000000-0000-4000-8000-000000000001",
        "date":"2026-08-21",
        "paymentMethod":"cash",
        "items":[{"productId":"85000000-0000-4000-8000-000000000001","quantity":2,"unitPrice":-100}],
        "actorUserId":"82000000-0000-4000-8000-000000000001"
      }'::jsonb
    )
  ),
  (
    'underpriced',
    public.post_pos_sale_v2(
      '{
        "businessId":"81000000-0000-4000-8000-000000000001",
        "locationId":"84000000-0000-4000-8000-000000000001",
        "date":"2026-08-21",
        "paymentMethod":"cash",
        "items":[{"productId":"85000000-0000-4000-8000-000000000001","quantity":2,"unitPrice":1}],
        "actorUserId":"82000000-0000-4000-8000-000000000001"
      }'::jsonb
    )
  ),
  (
    'inflated',
    public.post_pos_sale_v2(
      '{
        "businessId":"81000000-0000-4000-8000-000000000001",
        "locationId":"84000000-0000-4000-8000-000000000001",
        "date":"2026-08-21",
        "paymentMethod":"cash",
        "items":[{"productId":"85000000-0000-4000-8000-000000000001","quantity":2,"unitPrice":999999999}],
        "actorUserId":"82000000-0000-4000-8000-000000000001"
      }'::jsonb
    )
  ),
  (
    'legacy-wrapper',
    public.post_pos_sale(
      '{
        "businessId":"81000000-0000-4000-8000-000000000001",
        "locationId":"84000000-0000-4000-8000-000000000001",
        "date":"2026-08-21",
        "paymentMethod":"cash",
        "items":[{"productId":"85000000-0000-4000-8000-000000000001","quantity":2,"unitPrice":0}],
        "actorUserId":"82000000-0000-4000-8000-000000000001"
      }'::jsonb
    )
  );

select is(
  (select count(*) from pg_temp.pos_command_results),
  6::bigint,
  'omitted and tampered prices all complete through the authoritative path'
);

select ok(
  not exists (
    select 1
    from pg_temp.pos_command_results result
    join public.sales_invoice_lines line
      on line.sales_invoice_id = result.sale_id
    where line.product_id <> '85000000-0000-4000-8000-000000000001'
      or line.quantity <> 2
      or line.unit_price <> 25000
  )
  and (
    select count(*)
    from pg_temp.pos_command_results result
    join public.sales_invoice_lines line
      on line.sales_invoice_id = result.sale_id
  ) = 6,
  'every persisted line uses the catalog price regardless of caller input'
);

select ok(
  not exists (
    select 1
    from pg_temp.pos_command_results result
    join public.sales_invoices invoice on invoice.id = result.sale_id
    where invoice.total <> 50000
      or invoice.paid_amount <> 50000
      or invoice.status <> 'paid'
  ),
  'invoice totals and paid amounts are derived from the same catalog price'
);

select ok(
  not exists (
    select 1
    from pg_temp.pos_command_results result
    join public.payments payment
      on payment.document_type = 'sales_invoice'
      and payment.document_id = result.sale_id
    where payment.amount <> 50000
      or payment.status <> 'posted'
  )
  and (
    select count(*)
    from pg_temp.pos_command_results result
    join public.payments payment
      on payment.document_type = 'sales_invoice'
      and payment.document_id = result.sale_id
  ) = 6,
  'each inbound payment equals the authoritative invoice total'
);

select ok(
  not exists (
    select 1
    from pg_temp.pos_command_results result
    join public.payment_allocations allocation
      on allocation.document_type = 'sales_invoice'
      and allocation.document_id = result.sale_id
    where allocation.amount <> 50000
  )
  and (
    select count(*)
    from pg_temp.pos_command_results result
    join public.payment_allocations allocation
      on allocation.document_type = 'sales_invoice'
      and allocation.document_id = result.sale_id
  ) = 6,
  'each payment allocation equals the authoritative invoice total'
);

select ok(
  not exists (
    select 1
    from pg_temp.pos_command_results result
    join public.sales_invoices invoice on invoice.id = result.sale_id
    where (
      select coalesce(sum(line.debit), 0)
      from public.journal_lines line
      join public.chart_of_accounts account on account.id = line.account_id
      where line.journal_entry_id = invoice.journal_entry_id
        and account.code = '1100'
    ) <> 50000
    or (
      select coalesce(sum(line.credit), 0)
      from public.journal_lines line
      join public.chart_of_accounts account on account.id = line.account_id
      where line.journal_entry_id = invoice.journal_entry_id
        and account.code = '4000'
    ) <> 50000
  ),
  'sales journals use the authoritative receivable and revenue amounts'
);

select ok(
  not exists (
    select 1
    from pg_temp.pos_command_results result
    join public.payments payment
      on payment.document_type = 'sales_invoice'
      and payment.document_id = result.sale_id
    where (
      select coalesce(sum(line.debit), 0)
      from public.journal_lines line
      join public.chart_of_accounts account on account.id = line.account_id
      where line.journal_entry_id = payment.journal_entry_id
        and account.code = '1000'
    ) <> 50000
    or (
      select coalesce(sum(line.credit), 0)
      from public.journal_lines line
      join public.chart_of_accounts account on account.id = line.account_id
      where line.journal_entry_id = payment.journal_entry_id
        and account.code = '1100'
    ) <> 50000
  ),
  'payment journals use the same authoritative amount'
);

select ok(
  not exists (
    select 1
    from pg_temp.pos_command_results result
    join public.sales_invoices invoice on invoice.id = result.sale_id
    join public.payments payment
      on payment.document_type = 'sales_invoice'
      and payment.document_id = result.sale_id
    where invoice.created_by <> '82000000-0000-4000-8000-000000000001'
      or payment.created_by <> '82000000-0000-4000-8000-000000000001'
  )
  and (
    select count(*)
    from public.activity_events event
    where event.business_id = '81000000-0000-4000-8000-000000000001'
      and event.actor_user_id = '82000000-0000-4000-8000-000000000001'
      and event.action = 'posted POS sale'
  ) = 6,
  'the actor-bound command attributes every document and activity to the caller'
);

create temporary table pos_failure_baseline (snapshot jsonb not null) on commit drop;
grant select on pg_temp.pos_failure_baseline to service_role;

insert into pg_temp.pos_failure_baseline (snapshot)
select pg_catalog.jsonb_build_object(
  'invoices', (select count(*) from public.sales_invoices),
  'lines', (select count(*) from public.sales_invoice_lines),
  'payments', (select count(*) from public.payments),
  'allocations', (select count(*) from public.payment_allocations),
  'journals', (select count(*) from public.journal_entries),
  'journal_lines', (select count(*) from public.journal_lines),
  'activities', (select count(*) from public.activity_events)
);

select throws_ok(
  $command$
    select public.post_pos_sale_v2(
      '{
        "businessId":"81000000-0000-4000-8000-000000000001",
        "locationId":"84000000-0000-4000-8000-000000000001",
        "items":[{"productId":"85000000-0000-4000-8000-000000000002","quantity":1,"unitPrice":50000}],
        "actorUserId":"82000000-0000-4000-8000-000000000001"
      }'::jsonb
    )
  $command$,
  '22023',
  'Product POS price must be greater than zero.',
  'a non-positive configured catalog price fails closed'
);

select throws_ok(
  $command$
    select public.post_pos_sale_v2(
      '{
        "businessId":"81000000-0000-4000-8000-000000000001",
        "locationId":"84000000-0000-4000-8000-000000000001",
        "items":[{"productId":"85000000-0000-4000-8000-000000000003","quantity":1}],
        "actorUserId":"82000000-0000-4000-8000-000000000001"
      }'::jsonb
    )
  $command$,
  '22023',
  'Product is not active or sellable.',
  'an inactive catalog product fails closed'
);

select throws_ok(
  $command$
    select public.post_pos_sale_v2(
      '{
        "businessId":"81000000-0000-4000-8000-000000000001",
        "locationId":"84000000-0000-4000-8000-000000000001",
        "items":[{"productId":"85000000-0000-4000-8000-000000000004","quantity":1}],
        "actorUserId":"82000000-0000-4000-8000-000000000001"
      }'::jsonb
    )
  $command$,
  '22023',
  'Product is not active or sellable.',
  'a cross-tenant catalog product fails closed'
);

select is(
  pg_catalog.jsonb_build_object(
    'invoices', (select count(*) from public.sales_invoices),
    'lines', (select count(*) from public.sales_invoice_lines),
    'payments', (select count(*) from public.payments),
    'allocations', (select count(*) from public.payment_allocations),
    'journals', (select count(*) from public.journal_entries),
    'journal_lines', (select count(*) from public.journal_lines),
    'activities', (select count(*) from public.activity_events)
  ),
  (select snapshot from pg_temp.pos_failure_baseline),
  'every rejected pricing attempt leaves all financial and activity tables unchanged'
);

select * from finish();

rollback;
