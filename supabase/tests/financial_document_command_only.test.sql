begin;

create extension if not exists pgtap with schema extensions;

select plan(47);

with financial_tables(table_name) as (
  values
    ('branch_expenses'::text),
    ('payments'::text),
    ('payment_allocations'::text),
    ('purchase_bills'::text),
    ('purchase_bill_lines'::text),
    ('sales_invoices'::text),
    ('sales_invoice_lines'::text),
    ('journal_entries'::text),
    ('journal_lines'::text)
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
    from financial_tables
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
  'authenticated has read-only table privileges on financial documents'
);

with financial_tables(table_name) as (
  values
    ('branch_expenses'::text),
    ('payments'::text),
    ('payment_allocations'::text),
    ('purchase_bills'::text),
    ('purchase_bill_lines'::text),
    ('sales_invoices'::text),
    ('sales_invoice_lines'::text),
    ('journal_entries'::text),
    ('journal_lines'::text)
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
    from financial_tables
    cross join table_privileges
    where has_table_privilege(
      'anon',
      format('public.%I', table_name),
      privilege_name
    )
  ),
  0::bigint,
  'anon has no table privileges on financial documents'
);

with financial_tables(table_name) as (
  values
    ('branch_expenses'::text),
    ('payments'::text),
    ('payment_allocations'::text),
    ('purchase_bills'::text),
    ('purchase_bill_lines'::text),
    ('sales_invoices'::text),
    ('sales_invoice_lines'::text),
    ('journal_entries'::text),
    ('journal_lines'::text)
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
    from financial_tables
    cross join required_privileges
    where not has_table_privilege(
      'service_role',
      format('public.%I', table_name),
      privilege_name
    )
  ),
  0::bigint,
  'service_role retains the financial table privileges required by trusted workflows'
);

select is(
  (
    select count(*)
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = any(array[
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
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  ),
  0::bigint,
  'no direct financial-document mutation policy remains'
);

with command_functions(signature) as (
  values
    ('public.post_branch_expense(jsonb)'::text),
    ('public.post_payment(jsonb)'::text),
    ('public.post_purchase_bill(jsonb)'::text),
    ('public.post_sales_invoice(jsonb)'::text),
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
  'financial commands are service-role-only actor-bound entrypoints'
);

with internal_functions(signature) as (
  values
    ('public.post_branch_expense_internal(jsonb)'::text),
    ('public.post_payment_internal(jsonb)'::text),
    ('public.post_purchase_bill_internal(jsonb)'::text),
    ('public.post_sales_invoice_internal(jsonb)'::text),
    ('public.void_document_internal(jsonb)'::text),
    ('public.create_posted_journal(uuid,date,text,text,uuid,text,jsonb)'::text)
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
  'owner-only financial internals cannot bypass the actor-bound wrappers'
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
    '10000000-0000-4000-8000-00000000f001',
    'Command Only Finance One',
    'Command Only Finance One',
    'retail',
    'Owner One'
  ),
  (
    '10000000-0000-4000-8000-00000000f002',
    'Command Only Finance Two',
    'Command Only Finance Two',
    'retail',
    'Owner Two'
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
    '10000000-0000-4000-8000-00000000f001',
    '20000000-0000-4000-8000-00000000f001',
    'owner',
    'role',
    '{}',
    '{}'
  ),
  (
    '10000000-0000-4000-8000-00000000f001',
    '20000000-0000-4000-8000-00000000f002',
    'finance_admin',
    'custom',
    '{}',
    '{}'
  ),
  (
    '10000000-0000-4000-8000-00000000f002',
    '20000000-0000-4000-8000-00000000f003',
    'owner',
    'role',
    '{}',
    '{}'
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
  ('10000000-0000-4000-8000-00000000f001', '1000', 'Kas', 'asset', 'debit', 'cash', true, true),
  ('10000000-0000-4000-8000-00000000f001', '1100', 'Piutang', 'asset', 'debit', 'receivable', true, true),
  ('10000000-0000-4000-8000-00000000f001', '1200', 'Persediaan', 'asset', 'debit', 'inventory', true, true),
  ('10000000-0000-4000-8000-00000000f001', '2000', 'Utang', 'liability', 'credit', 'payable', true, true),
  ('10000000-0000-4000-8000-00000000f001', '4000', 'Pendapatan', 'revenue', 'credit', 'revenue', true, true),
  ('10000000-0000-4000-8000-00000000f001', '5000', 'HPP', 'expense', 'debit', 'cogs', true, true)
on conflict (business_id, code) do nothing;

insert into public.warehouses (id, business_id, code, name, is_active)
values (
  '30000000-0000-4000-8000-00000000f001',
  '10000000-0000-4000-8000-00000000f001',
  'WH-CMD',
  'Command Warehouse',
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
values (
  '40000000-0000-4000-8000-00000000f001',
  '10000000-0000-4000-8000-00000000f001',
  'LOC-CMD',
  'Command Branch',
  'branch',
  '30000000-0000-4000-8000-00000000f001',
  true
);

insert into public.customers (
  id,
  business_id,
  code,
  name,
  credit_limit,
  is_active
)
values (
  '50000000-0000-4000-8000-00000000f001',
  '10000000-0000-4000-8000-00000000f001',
  'CUST-CMD',
  'Command Customer',
  1000000,
  true
);

insert into public.suppliers (id, business_id, code, name, is_active)
values (
  '60000000-0000-4000-8000-00000000f001',
  '10000000-0000-4000-8000-00000000f001',
  'SUP-CMD',
  'Command Supplier',
  true
);

insert into public.products (
  id,
  business_id,
  sku,
  name,
  unit,
  track_stock,
  default_warehouse_id,
  selling_price,
  purchase_price,
  is_sellable,
  is_purchasable,
  is_active
)
values (
  '70000000-0000-4000-8000-00000000f001',
  '10000000-0000-4000-8000-00000000f001',
  'SKU-CMD',
  'Command Product',
  'pcs',
  false,
  '30000000-0000-4000-8000-00000000f001',
  150,
  80,
  true,
  true,
  true
);

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"20000000-0000-4000-8000-00000000f002"}',
  true
);
set local role authenticated;

select throws_ok(
  $command$
    insert into public.branch_expenses (
      business_id, location_id, date, amount, category
    ) values (
      '10000000-0000-4000-8000-00000000f001',
      '40000000-0000-4000-8000-00000000f001',
      '2026-01-05',
      10,
      'Bypass'
    )
  $command$,
  '42501',
  'permission denied for table branch_expenses',
  'authenticated cannot insert branch expenses directly'
);

select throws_ok(
  $command$update public.branch_expenses set amount = 11 where false$command$,
  '42501',
  'permission denied for table branch_expenses',
  'authenticated cannot update branch expenses directly'
);

select throws_ok(
  $command$delete from public.branch_expenses where false$command$,
  '42501',
  'permission denied for table branch_expenses',
  'authenticated cannot delete branch expenses directly'
);

select throws_ok(
  $command$
    insert into public.sales_invoices (
      business_id, invoice_no, customer_id, date, due_date
    ) values (
      '10000000-0000-4000-8000-00000000f001',
      'INV-BYPASS',
      '50000000-0000-4000-8000-00000000f001',
      '2026-01-05',
      '2026-01-10'
    )
  $command$,
  '42501',
  'permission denied for table sales_invoices',
  'authenticated cannot insert sales invoices directly'
);

select throws_ok(
  $command$update public.sales_invoices set total = 1 where false$command$,
  '42501',
  'permission denied for table sales_invoices',
  'authenticated cannot update sales invoices directly'
);

select throws_ok(
  $command$delete from public.sales_invoices where false$command$,
  '42501',
  'permission denied for table sales_invoices',
  'authenticated cannot delete sales invoices directly'
);

select throws_ok(
  $command$
    insert into public.purchase_bills (
      business_id, bill_no, supplier_id, date, due_date
    ) values (
      '10000000-0000-4000-8000-00000000f001',
      'BILL-BYPASS',
      '60000000-0000-4000-8000-00000000f001',
      '2026-01-05',
      '2026-01-10'
    )
  $command$,
  '42501',
  'permission denied for table purchase_bills',
  'authenticated cannot insert purchase bills directly'
);

select throws_ok(
  $command$update public.purchase_bills set total = 1 where false$command$,
  '42501',
  'permission denied for table purchase_bills',
  'authenticated cannot update purchase bills directly'
);

select throws_ok(
  $command$delete from public.purchase_bills where false$command$,
  '42501',
  'permission denied for table purchase_bills',
  'authenticated cannot delete purchase bills directly'
);

select throws_ok(
  $command$
    insert into public.payments (
      business_id, direction, document_type, document_id, date, amount, method, reference
    ) values (
      '10000000-0000-4000-8000-00000000f001',
      'inbound',
      'sales_invoice',
      '80000000-0000-4000-8000-00000000f001',
      '2026-01-05',
      10,
      'cash',
      'RCV-BYPASS'
    )
  $command$,
  '42501',
  'permission denied for table payments',
  'authenticated cannot insert payments directly'
);

select throws_ok(
  $command$update public.payments set amount = 1 where false$command$,
  '42501',
  'permission denied for table payments',
  'authenticated cannot update payments directly'
);

select throws_ok(
  $command$delete from public.payments where false$command$,
  '42501',
  'permission denied for table payments',
  'authenticated cannot delete payments directly'
);

select throws_ok(
  $command$
    insert into public.sales_invoice_lines (
      business_id, sales_invoice_id, product_id, description, quantity, unit_price
    ) values (
      '10000000-0000-4000-8000-00000000f001',
      '80000000-0000-4000-8000-00000000f001',
      '70000000-0000-4000-8000-00000000f001',
      'Bypass',
      1,
      1
    )
  $command$,
  '42501',
  'permission denied for table sales_invoice_lines',
  'authenticated cannot insert sales invoice lines directly'
);

select throws_ok(
  $command$delete from public.purchase_bill_lines where false$command$,
  '42501',
  'permission denied for table purchase_bill_lines',
  'authenticated cannot delete purchase bill lines directly'
);

select throws_ok(
  $command$
    insert into public.payment_allocations (
      business_id, payment_id, document_type, document_id, amount
    ) values (
      '10000000-0000-4000-8000-00000000f001',
      '90000000-0000-4000-8000-00000000f001',
      'sales_invoice',
      '80000000-0000-4000-8000-00000000f001',
      1
    )
  $command$,
  '42501',
  'permission denied for table payment_allocations',
  'authenticated cannot insert payment allocations directly'
);

select throws_ok(
  $command$update public.journal_entries set status = 'reversed' where false$command$,
  '42501',
  'permission denied for table journal_entries',
  'authenticated cannot rewrite posted journal headers directly'
);

select throws_ok(
  $command$delete from public.journal_lines where false$command$,
  '42501',
  'permission denied for table journal_lines',
  'authenticated cannot delete posted journal lines directly'
);

reset role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

select throws_ok(
  $command$
    select public.post_branch_expense(
      '{
        "businessId":"10000000-0000-4000-8000-00000000f001",
        "locationId":"40000000-0000-4000-8000-00000000f001",
        "date":"2026-01-05",
        "amount":25,
        "category":"Denied",
        "actorUserId":"20000000-0000-4000-8000-00000000f002"
      }'::jsonb
    )
  $command$,
  'P0001',
  'You are not allowed to perform pos:expenses.',
  'custom finance member cannot use the branch-expense command without effective permission'
);

select throws_ok(
  $command$
    select public.post_sales_invoice(
      '{
        "businessId":"10000000-0000-4000-8000-00000000f001",
        "actorUserId":"20000000-0000-4000-8000-00000000f002"
      }'::jsonb
    )
  $command$,
  '42501',
  'Actor lacks accounting:write permission for this business.',
  'custom finance member cannot use accounting commands without effective permission'
);

select throws_ok(
  $command$
    select public.post_purchase_bill(
      '{
        "businessId":"10000000-0000-4000-8000-00000000f001",
        "actorUserId":"20000000-0000-4000-8000-00000000f003"
      }'::jsonb
    )
  $command$,
  '42501',
  'Actor lacks accounting:write permission for this business.',
  'an owner from another tenant cannot use accounting commands cross-tenant'
);

reset role;

select is(
  (
    select
      (select count(*) from public.branch_expenses where business_id = '10000000-0000-4000-8000-00000000f001')
      + (select count(*) from public.sales_invoices where business_id = '10000000-0000-4000-8000-00000000f001')
      + (select count(*) from public.purchase_bills where business_id = '10000000-0000-4000-8000-00000000f001')
      + (select count(*) from public.payments where business_id = '10000000-0000-4000-8000-00000000f001')
  ),
  0::bigint,
  'denied raw and command attempts leave no partial financial documents'
);

select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

select lives_ok(
  $command$
    select public.post_branch_expense(
      '{
        "businessId":"10000000-0000-4000-8000-00000000f001",
        "locationId":"40000000-0000-4000-8000-00000000f001",
        "date":"2026-01-05",
        "amount":125,
        "paymentMethod":"cash",
        "category":"Utilities",
        "memo":"Command-only rehearsal",
        "actorUserId":"20000000-0000-4000-8000-00000000f001"
      }'::jsonb
    )
  $command$,
  'authorized branch-expense command succeeds'
);

reset role;

select ok(
  exists (
    select 1
    from public.branch_expenses expense
    join public.journal_entries journal on journal.id = expense.journal_entry_id
    where expense.business_id = '10000000-0000-4000-8000-00000000f001'
      and expense.amount = 125
      and expense.created_by = '20000000-0000-4000-8000-00000000f001'
      and journal.reference_id = expense.id
      and journal.status = 'posted'
  ),
  'branch-expense command links the trusted actor, expense, and posted journal'
);

select ok(
  exists (
    select 1
    from public.branch_expenses expense
    join public.journal_lines line on line.journal_entry_id = expense.journal_entry_id
    where expense.business_id = '10000000-0000-4000-8000-00000000f001'
      and expense.amount = 125
    group by expense.id
    having count(*) = 2 and sum(line.debit) = sum(line.credit) and sum(line.debit) = 125
  ),
  'branch-expense command creates a balanced two-line journal atomically'
);

select is(
  (
    select count(*)
    from public.activity_events
    where business_id = '10000000-0000-4000-8000-00000000f001'
      and action = 'posted branch expense'
      and actor_user_id = '20000000-0000-4000-8000-00000000f001'
  ),
  1::bigint,
  'branch-expense command records the real actor in the activity trail'
);

select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

select lives_ok(
  $command$
    select public.post_sales_invoice(
      '{
        "businessId":"10000000-0000-4000-8000-00000000f001",
        "customerId":"50000000-0000-4000-8000-00000000f001",
        "date":"2026-01-05",
        "dueDate":"2026-01-10",
        "items":[{
          "productId":"70000000-0000-4000-8000-00000000f001",
          "warehouseId":"30000000-0000-4000-8000-00000000f001",
          "quantity":2,
          "unitPrice":150
        }],
        "actorUserId":"20000000-0000-4000-8000-00000000f001"
      }'::jsonb
    )
  $command$,
  'authorized sales-invoice command succeeds'
);

reset role;

select ok(
  exists (
    select 1
    from public.sales_invoices invoice
    join public.sales_invoice_lines line on line.sales_invoice_id = invoice.id
    join public.journal_entries journal on journal.id = invoice.journal_entry_id
    where invoice.business_id = '10000000-0000-4000-8000-00000000f001'
      and invoice.customer_id = '50000000-0000-4000-8000-00000000f001'
      and invoice.total = 300
      and invoice.status = 'posted'
      and invoice.created_by = '20000000-0000-4000-8000-00000000f001'
      and line.quantity = 2
      and line.unit_price = 150
      and journal.reference_id = invoice.id
  ),
  'sales command creates a mutually consistent header, line, and journal link'
);

select ok(
  exists (
    select 1
    from public.sales_invoices invoice
    join public.journal_lines line on line.journal_entry_id = invoice.journal_entry_id
    where invoice.business_id = '10000000-0000-4000-8000-00000000f001'
      and invoice.total = 300
    group by invoice.id
    having count(*) = 2 and sum(line.debit) = sum(line.credit) and sum(line.debit) = 300
  ),
  'sales command creates a balanced journal from the posted total'
);

select is(
  (
    select count(*)
    from public.activity_events
    where business_id = '10000000-0000-4000-8000-00000000f001'
      and action = 'posted invoice'
      and actor_user_id = '20000000-0000-4000-8000-00000000f001'
  ),
  1::bigint,
  'sales command records the real actor in the activity trail'
);

select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

select lives_ok(
  $command$
    select public.post_purchase_bill(
      '{
        "businessId":"10000000-0000-4000-8000-00000000f001",
        "supplierId":"60000000-0000-4000-8000-00000000f001",
        "date":"2026-01-05",
        "dueDate":"2026-01-10",
        "items":[{
          "productId":"70000000-0000-4000-8000-00000000f001",
          "warehouseId":"30000000-0000-4000-8000-00000000f001",
          "quantity":3,
          "unitCost":80
        }],
        "actorUserId":"20000000-0000-4000-8000-00000000f001"
      }'::jsonb
    )
  $command$,
  'authorized purchase-bill command succeeds'
);

reset role;

select ok(
  exists (
    select 1
    from public.purchase_bills bill
    join public.purchase_bill_lines line on line.purchase_bill_id = bill.id
    join public.journal_entries journal on journal.id = bill.journal_entry_id
    where bill.business_id = '10000000-0000-4000-8000-00000000f001'
      and bill.supplier_id = '60000000-0000-4000-8000-00000000f001'
      and bill.total = 240
      and bill.status = 'posted'
      and bill.created_by = '20000000-0000-4000-8000-00000000f001'
      and line.quantity = 3
      and line.unit_cost = 80
      and journal.reference_id = bill.id
  ),
  'purchase command creates a mutually consistent header, line, and journal link'
);

select ok(
  exists (
    select 1
    from public.purchase_bills bill
    join public.journal_lines line on line.journal_entry_id = bill.journal_entry_id
    where bill.business_id = '10000000-0000-4000-8000-00000000f001'
      and bill.total = 240
    group by bill.id
    having count(*) = 2 and sum(line.debit) = sum(line.credit) and sum(line.debit) = 240
  ),
  'purchase command creates a balanced journal from the posted total'
);

select is(
  (
    select count(*)
    from public.activity_events
    where business_id = '10000000-0000-4000-8000-00000000f001'
      and action = 'posted bill'
      and actor_user_id = '20000000-0000-4000-8000-00000000f001'
  ),
  1::bigint,
  'purchase command records the real actor in the activity trail'
);

select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

select lives_ok(
  $command$
    select public.post_payment(
      jsonb_build_object(
        'businessId', '10000000-0000-4000-8000-00000000f001',
        'documentType', 'sales_invoice',
        'documentId', (
          select id
          from public.sales_invoices
          where business_id = '10000000-0000-4000-8000-00000000f001'
            and customer_id = '50000000-0000-4000-8000-00000000f001'
          order by created_at desc
          limit 1
        ),
        'direction', 'inbound',
        'date', '2026-01-06',
        'amount', 100,
        'method', 'bank_transfer',
        'actorUserId', '20000000-0000-4000-8000-00000000f001'
      )
    )
  $command$,
  'authorized payment command succeeds'
);

reset role;

select ok(
  exists (
    select 1
    from public.payments payment
    join public.payment_allocations allocation on allocation.payment_id = payment.id
    join public.sales_invoices invoice on invoice.id = payment.document_id
    where payment.business_id = '10000000-0000-4000-8000-00000000f001'
      and payment.amount = 100
      and payment.status = 'posted'
      and payment.created_by = '20000000-0000-4000-8000-00000000f001'
      and allocation.document_id = invoice.id
      and allocation.amount = payment.amount
      and invoice.paid_amount = 100
      and invoice.status = 'partially_paid'
  ),
  'payment command keeps payment, allocation, and document balance consistent'
);

select ok(
  exists (
    select 1
    from public.payments payment
    join public.journal_lines line on line.journal_entry_id = payment.journal_entry_id
    where payment.business_id = '10000000-0000-4000-8000-00000000f001'
      and payment.amount = 100
    group by payment.id
    having count(*) = 2 and sum(line.debit) = sum(line.credit) and sum(line.debit) = 100
  ),
  'payment command creates a balanced journal from the settlement amount'
);

select is(
  (
    select count(*)
    from public.activity_events
    where business_id = '10000000-0000-4000-8000-00000000f001'
      and action = 'posted payment'
      and actor_user_id = '20000000-0000-4000-8000-00000000f001'
  ),
  1::bigint,
  'payment command records the real actor in the activity trail'
);

select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

select lives_ok(
  $command$
    select public.void_document(
      jsonb_build_object(
        'businessId', '10000000-0000-4000-8000-00000000f001',
        'documentType', 'purchase_bill',
        'documentId', (
          select id
          from public.purchase_bills
          where business_id = '10000000-0000-4000-8000-00000000f001'
            and supplier_id = '60000000-0000-4000-8000-00000000f001'
          order by created_at desc
          limit 1
        ),
        'date', '2026-01-07',
        'reason', 'Command-only reversal rehearsal',
        'actorUserId', '20000000-0000-4000-8000-00000000f001'
      )
    )
  $command$,
  'authorized void command succeeds'
);

reset role;

select ok(
  exists (
    select 1
    from public.purchase_bills bill
    join public.journal_entries original on original.id = bill.journal_entry_id
    join public.journal_entries reversal on reversal.id = original.reversed_entry_id
    where bill.business_id = '10000000-0000-4000-8000-00000000f001'
      and bill.supplier_id = '60000000-0000-4000-8000-00000000f001'
      and bill.status = 'void'
      and original.status = 'reversed'
      and reversal.source = 'reversal'
      and reversal.reference_id = bill.id
  ),
  'void command changes status only through a linked reversal journal'
);

select ok(
  exists (
    select 1
    from public.purchase_bills bill
    join public.journal_entries original on original.id = bill.journal_entry_id
    join public.journal_lines original_line on original_line.journal_entry_id = original.id
    join public.journal_lines reversal_line on reversal_line.journal_entry_id = original.reversed_entry_id
    where bill.business_id = '10000000-0000-4000-8000-00000000f001'
      and bill.supplier_id = '60000000-0000-4000-8000-00000000f001'
    group by bill.id, original.id
    having count(distinct original_line.id) = 2
      and count(distinct reversal_line.id) = 2
      and sum(distinct original_line.debit) = sum(distinct original_line.credit)
      and sum(distinct reversal_line.debit) = sum(distinct reversal_line.credit)
  ),
  'void preserves the original lines and creates a balanced reversal'
);

select is(
  (
    select count(*)
    from public.activity_events
    where business_id = '10000000-0000-4000-8000-00000000f001'
      and action = 'document voided'
      and actor_user_id = '20000000-0000-4000-8000-00000000f001'
  ),
  1::bigint,
  'void command records the real actor and reason in the activity trail'
);

select * from finish();

rollback;
