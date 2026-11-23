begin;

create extension if not exists pgtap with schema extensions;

select plan(39);

select ok(
  has_table_privilege('authenticated', 'public.attachments', 'SELECT')
  and not has_table_privilege('authenticated', 'public.attachments', 'INSERT')
  and not has_table_privilege('authenticated', 'public.attachments', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.attachments', 'DELETE')
  and not has_table_privilege('authenticated', 'public.attachments', 'TRUNCATE'),
  'attachment metadata is direct-read-only for authenticated clients'
);

select is(
  (
    select count(*)
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        coalesce(qual, '') ilike '%erp-attachments%'
        or coalesce(with_check, '') ilike '%erp-attachments%'
      )
  ),
  0::bigint,
  'the private ERP bucket has no direct authenticated object policy'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.reconciliation_rollup(uuid,uuid,text,date,date,integer)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.reconciliation_rollup(uuid,uuid,uuid,text,date,date,integer)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.reconciliation_rollup(uuid,uuid,uuid,text,date,date,integer)',
    'EXECUTE'
  ),
  'reconciliation is exposed only through the actor-bound service signature'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_proc procedure_record
    where procedure_record.oid =
      'public.reconciliation_rollup(uuid,uuid,uuid,text,date,date,integer)'::regprocedure
      and procedure_record.prosecdef
      and procedure_record.proconfig = array['search_path=pg_catalog']::text[]
  ),
  'the actor-bound reconciliation function is a fixed-path security definer'
);

select is(
  (
    select count(*)
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = any(array[
        'sales_invoices', 'sales_invoice_lines',
        'purchase_bills', 'purchase_bill_lines',
        'payments', 'customers', 'suppliers', 'branch_expenses',
        'payroll_runs', 'audit_logs', 'attachments',
        'product_structures', 'product_structure_lines',
        'demand_forecasts', 'mrp_runs', 'mrp_recommendations',
        'production_orders', 'production_order_lines'
      ])
      and cmd = 'SELECT'
  ),
  18::bigint,
  'every sensitive target has exactly one operation-specific SELECT policy'
);

select is(
  (
    select count(*)
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = any(array[
        'product_structures', 'product_structure_lines',
        'demand_forecasts', 'mrp_runs', 'mrp_recommendations',
        'production_orders', 'production_order_lines'
      ])
      and cmd = 'ALL'
  ),
  0::bigint,
  'manufacturing tables no longer use permissive FOR ALL policies'
);

select is(
  (
    select count(*)
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = any(array[
        'product_structures', 'product_structure_lines',
        'demand_forecasts', 'mrp_runs', 'mrp_recommendations',
        'production_orders', 'production_order_lines'
      ])
      and cmd in ('INSERT', 'UPDATE', 'DELETE')
  ),
  21::bigint,
  'manufacturing writes retain one effective-permission policy per operation'
);

select ok(
  pg_catalog.pg_get_functiondef('public.audit_row_change()'::regprocedure)
    ilike '%app_private.redact_audit_snapshot%'
  and pg_catalog.pg_get_functiondef(
    'app_private.redact_audit_snapshot(text,jsonb)'::regprocedure
  ) ilike '%gross_pay%deductions%tax_withheld%net_pay%components%',
  'payroll audit snapshots are redacted before persistence'
);

insert into public.businesses (
  id, legal_name, display_name, industry, owner_name
)
values
  (
    '91000000-0000-4000-8000-000000000001',
    'Sensitive Read A', 'Sensitive Read A', 'manufacturing', 'Owner A'
  ),
  (
    '91000000-0000-4000-8000-000000000002',
    'Sensitive Read B', 'Sensitive Read B', 'retail', 'Owner B'
  );

insert into public.business_members (
  business_id, auth_user_id, role, access_scope, access_permissions, location_ids
)
values
  ('91000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', 'owner', 'role', '{}', '{}'),
  ('91000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000002', 'staff', 'custom', array['pos:read'], array['94000000-0000-4000-8000-000000000001']::uuid[]),
  ('91000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000003', 'finance_admin', 'custom', array['accounting:read'], array['94000000-0000-4000-8000-000000000001']::uuid[]),
  ('91000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000004', 'finance_admin', 'custom', array['reports:export'], array['94000000-0000-4000-8000-000000000001']::uuid[]),
  ('91000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000005', 'hr', 'custom', array['payroll:run'], '{}'),
  ('91000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000006', 'staff', 'custom', array['inventory:manage'], array['94000000-0000-4000-8000-000000000001']::uuid[]),
  ('91000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000007', 'external_advisor', 'role', '{}', '{}'),
  ('91000000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000008', 'owner', 'role', '{}', '{}');

insert into public.warehouses (id, business_id, code, name, is_active)
values
  ('93000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'A-1', 'Warehouse A1', true),
  ('93000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000001', 'A-2', 'Warehouse A2', true);

insert into public.locations (
  id, business_id, code, name, type, warehouse_id, is_active
)
values
  ('94000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'LOC-1', 'Location 1', 'branch', '93000000-0000-4000-8000-000000000001', true),
  ('94000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000001', 'LOC-2', 'Location 2', 'branch', '93000000-0000-4000-8000-000000000002', true);

insert into public.customers (id, business_id, code, name)
values ('95000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'CUS-1', 'Customer A');

insert into public.suppliers (id, business_id, code, name)
values ('95000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000001', 'SUP-1', 'Supplier A');

insert into public.products (
  id, business_id, sku, name, unit, default_warehouse_id,
  selling_price, purchase_price
)
values
  ('95000000-0000-4000-8000-000000000003', '91000000-0000-4000-8000-000000000001', 'PRD-1', 'Product A', 'pcs', '93000000-0000-4000-8000-000000000001', 100, 50),
  ('95000000-0000-4000-8000-000000000004', '91000000-0000-4000-8000-000000000001', 'PRD-2', 'Component A', 'pcs', '93000000-0000-4000-8000-000000000001', 50, 20);

insert into public.sales_invoices (
  id, business_id, invoice_no, customer_id, date, due_date,
  status, total, location_id, source
)
values
  ('96000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'INV-1', '95000000-0000-4000-8000-000000000001', '2026-08-01', '2026-08-01', 'posted', 100, '94000000-0000-4000-8000-000000000001', 'manual'),
  ('96000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000001', 'INV-2', '95000000-0000-4000-8000-000000000001', '2026-08-01', '2026-08-01', 'posted', 100, '94000000-0000-4000-8000-000000000002', 'manual'),
  ('96000000-0000-4000-8000-000000000003', '91000000-0000-4000-8000-000000000001', 'INV-3', '95000000-0000-4000-8000-000000000001', '2026-08-01', '2026-08-01', 'posted', 100, null, 'manual');

insert into public.sales_invoice_lines (
  id, business_id, sales_invoice_id, product_id, warehouse_id,
  description, quantity, unit_price
)
values
  ('96100000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', '96000000-0000-4000-8000-000000000001', '95000000-0000-4000-8000-000000000003', '93000000-0000-4000-8000-000000000001', 'Line 1', 1, 100),
  ('96100000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000001', '96000000-0000-4000-8000-000000000002', '95000000-0000-4000-8000-000000000003', '93000000-0000-4000-8000-000000000002', 'Line 2', 1, 100);

insert into public.purchase_bills (
  id, business_id, bill_no, supplier_id, date, due_date, status, total
)
values
  ('96200000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'BILL-1', '95000000-0000-4000-8000-000000000002', '2026-08-01', '2026-08-01', 'posted', 50),
  ('96200000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000001', 'BILL-2', '95000000-0000-4000-8000-000000000002', '2026-08-01', '2026-08-01', 'posted', 50);

insert into public.purchase_bill_lines (
  id, business_id, purchase_bill_id, product_id, warehouse_id,
  description, quantity, unit_cost
)
values
  ('96300000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', '96200000-0000-4000-8000-000000000001', '95000000-0000-4000-8000-000000000003', '93000000-0000-4000-8000-000000000001', 'Bill line 1', 1, 50),
  ('96300000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000001', '96200000-0000-4000-8000-000000000002', '95000000-0000-4000-8000-000000000003', '93000000-0000-4000-8000-000000000002', 'Bill line 2', 1, 50);

insert into public.employees (
  id, business_id, employee_no, name, role, contract_type,
  status, base_salary, joined_at
)
values ('96400000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'EMP-1', 'Employee A', 'Operator', 'permanent', 'active', 1000, '2026-01-01');

insert into public.payroll_runs (
  id, business_id, period, employee_id, gross_pay,
  deductions, tax_withheld, net_pay, components
)
values ('96500000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', '2026-08', '96400000-0000-4000-8000-000000000001', 1000, 100, 100, 800, '[{"kind":"salary","amount":1000}]');

insert into public.payments (
  id, business_id, direction, document_type, document_id,
  date, amount, method, reference, status
)
values
  ('96600000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'inbound', 'sales_invoice', '96000000-0000-4000-8000-000000000001', '2026-08-01', 100, 'cash', 'PAY-1', 'posted'),
  ('96600000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000001', 'inbound', 'sales_invoice', '96000000-0000-4000-8000-000000000002', '2026-08-01', 100, 'cash', 'PAY-2', 'posted'),
  ('96600000-0000-4000-8000-000000000003', '91000000-0000-4000-8000-000000000001', 'outbound', 'payroll_run', '96500000-0000-4000-8000-000000000001', '2026-08-01', 800, 'bank_transfer', 'PAY-3', 'posted');

insert into public.branch_expenses (
  id, business_id, location_id, date, amount, payment_method, category
)
values
  ('96700000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000001', '2026-08-01', 10, 'cash', 'Ops'),
  ('96700000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000002', '2026-08-01', 10, 'cash', 'Ops');

insert into public.attachments (
  id, business_id, owner_type, owner_id, file_name,
  storage_path, mime_type, size_bytes
)
values
  ('96800000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'sales_invoice', '96000000-0000-4000-8000-000000000001', 'invoice-1.pdf', '91000000-0000-4000-8000-000000000001/sales_invoice/96000000-0000-4000-8000-000000000001/a.pdf', 'application/pdf', 10),
  ('96800000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000001', 'sales_invoice', '96000000-0000-4000-8000-000000000002', 'invoice-2.pdf', '91000000-0000-4000-8000-000000000001/sales_invoice/96000000-0000-4000-8000-000000000002/b.pdf', 'application/pdf', 10),
  ('96800000-0000-4000-8000-000000000003', '91000000-0000-4000-8000-000000000001', 'payroll_run', '96500000-0000-4000-8000-000000000001', 'payroll.pdf', '91000000-0000-4000-8000-000000000001/payroll_run/96500000-0000-4000-8000-000000000001/c.pdf', 'application/pdf', 10);

insert into public.product_structures (
  id, business_id, parent_product_id, type
)
values ('96900000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', '95000000-0000-4000-8000-000000000003', 'bom');

insert into public.product_structure_lines (
  id, business_id, structure_id, component_product_id, quantity
)
values ('96910000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', '96900000-0000-4000-8000-000000000001', '95000000-0000-4000-8000-000000000004', 1);

insert into public.demand_forecasts (
  id, business_id, product_id, location_id,
  period_start, period_end, quantity
)
values
  ('96920000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', '95000000-0000-4000-8000-000000000003', '94000000-0000-4000-8000-000000000001', '2026-08-01', '2026-08-31', 10),
  ('96920000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000001', '95000000-0000-4000-8000-000000000003', '94000000-0000-4000-8000-000000000002', '2026-08-01', '2026-08-31', 10);

insert into public.mrp_runs (
  id, business_id, name, period_start, period_end
)
values ('96930000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'MRP A', '2026-08-01', '2026-08-31');

insert into public.mrp_recommendations (
  id, business_id, mrp_run_id, product_id, type, quantity, due_date
)
values ('96940000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', '96930000-0000-4000-8000-000000000001', '95000000-0000-4000-8000-000000000003', 'production', 10, '2026-08-15');

insert into public.production_orders (
  id, business_id, order_no, product_id, warehouse_id,
  quantity, planned_date
)
values
  ('96950000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'PO-1', '95000000-0000-4000-8000-000000000003', '93000000-0000-4000-8000-000000000001', 10, '2026-08-15'),
  ('96950000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000001', 'PO-2', '95000000-0000-4000-8000-000000000003', '93000000-0000-4000-8000-000000000002', 10, '2026-08-15');

insert into public.production_order_lines (
  id, business_id, production_order_id, component_product_id,
  warehouse_id, planned_quantity
)
values
  ('96960000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', '96950000-0000-4000-8000-000000000001', '95000000-0000-4000-8000-000000000004', '93000000-0000-4000-8000-000000000001', 10),
  ('96960000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000001', '96950000-0000-4000-8000-000000000002', '95000000-0000-4000-8000-000000000004', '93000000-0000-4000-8000-000000000002', 10);

insert into public.audit_logs (
  business_id, action, table_name, before_data, after_data
)
values (
  '91000000-0000-4000-8000-000000000001',
  'UPDATE',
  'sales_invoices',
  '{"status":"draft"}',
  '{"status":"posted"}'
);

select ok(
  not exists (
    select 1
    from public.audit_logs
    where table_name = 'payroll_runs'
      and (
        coalesce(before_data, '{}'::jsonb) ?| array['gross_pay', 'deductions', 'tax_withheld', 'net_pay', 'components']
        or coalesce(after_data, '{}'::jsonb) ?| array['gross_pay', 'deductions', 'tax_withheld', 'net_pay', 'components']
      )
  ),
  'new payroll audit rows contain no protected compensation fields'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"92000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

select is((select count(*) from public.branch_expenses), 1::bigint, 'POS reader sees only the assigned branch expense');
select is((select count(*) from public.sales_invoices), 0::bigint, 'POS reader cannot query financial invoices directly');
select is((select count(*) from public.customers), 0::bigint, 'POS reader cannot query customer contact and tax data directly');
select is((select count(*) from public.payments), 0::bigint, 'POS reader cannot query cash-flow records directly');
select is((select count(*) from public.attachments), 0::bigint, 'POS reader cannot enumerate attachment metadata');
select is((select count(*) from public.product_structures), 0::bigint, 'POS reader cannot query manufacturing structures');

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"92000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
set local role authenticated;

select is((select count(*) from public.sales_invoices), 1::bigint, 'assigned accounting reader sees one location invoice');
select is((select count(*) from public.sales_invoice_lines), 1::bigint, 'assigned accounting reader sees only lines from an authorized invoice');
select is((select count(*) from public.purchase_bills), 1::bigint, 'assigned accounting reader sees one warehouse-scoped bill');
select is((select count(*) from public.purchase_bill_lines), 1::bigint, 'assigned accounting reader sees one warehouse-scoped bill line');
select is((select count(*) from public.payments), 1::bigint, 'accounting reader sees only settlement data for an authorized financial document');
select is((select count(*) from public.customers), 2::bigint, 'accounting reader retains authorized customer access');
select is((select count(*) from public.suppliers), 1::bigint, 'accounting reader retains authorized supplier access');
select is((select count(*) from public.attachments), 1::bigint, 'accounting reader sees one attachment from an assigned document');
select is((select count(*) from public.payroll_runs), 0::bigint, 'accounting reader cannot retrieve payroll rows');
select is((select count(*) from public.audit_logs where table_name = 'payroll_runs'), 0::bigint, 'accounting reader cannot retrieve payroll audit records');
select is((select count(*) from public.audit_logs where table_name <> 'payroll_runs'), 1::bigint, 'accounting reader retains non-payroll audit visibility');

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"92000000-0000-4000-8000-000000000005","role":"authenticated"}',
  true
);
set local role authenticated;

select is((select count(*) from public.payroll_runs), 1::bigint, 'payroll member can read the authorized payroll run');
select is((select count(*) from public.attachments), 1::bigint, 'payroll member can read only payroll attachment metadata');
select is((select count(*) from public.audit_logs where table_name = 'payroll_runs'), 1::bigint, 'payroll member can read the redacted payroll audit event');
select is((select count(*) from public.audit_logs where table_name <> 'payroll_runs'), 0::bigint, 'payroll-only member cannot read financial audit events');

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"92000000-0000-4000-8000-000000000006","role":"authenticated"}',
  true
);
set local role authenticated;

select is((select count(*) from public.product_structures), 1::bigint, 'inventory member can read business-wide structures');
select is((select count(*) from public.demand_forecasts), 1::bigint, 'inventory member sees only assigned demand forecasts');
select is((select count(*) from public.mrp_runs), 1::bigint, 'inventory member retains MRP run access');
select is((select count(*) from public.mrp_recommendations), 1::bigint, 'inventory member retains MRP recommendation access');
select is((select count(*) from public.production_orders), 1::bigint, 'inventory member sees only assigned production orders');
select is((select count(*) from public.production_order_lines), 1::bigint, 'inventory member sees only assigned production order lines');

reset role;
set local role service_role;

select throws_ok(
  $$select * from public.reconciliation_rollup(
    '91000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000002',
    null, null, null, null, 500
  )$$,
  '42501',
  'Accounting read permission is required.',
  'service reconciliation rejects a POS-only injected actor'
);

select throws_ok(
  $$select * from public.reconciliation_rollup(
    '91000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000003',
    '94000000-0000-4000-8000-000000000002',
    null, null, null, 500
  )$$,
  '42501',
  'The requested location is outside the member assignment.',
  'service reconciliation rejects an unassigned location'
);

select lives_ok(
  $$select * from public.reconciliation_rollup(
    '91000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000003',
    '94000000-0000-4000-8000-000000000001',
    null, null, null, 500
  )$$,
  'assigned accounting actor can call the reconciliation service function'
);

reset role;

select * from finish();

rollback;
