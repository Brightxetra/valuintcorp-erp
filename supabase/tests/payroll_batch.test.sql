begin;

create extension if not exists pgtap with schema extensions;
select plan(10);

insert into public.businesses (id, legal_name, display_name, industry, owner_name)
values ('16000000-0000-4000-8000-000000000001', 'Payroll Test', 'Payroll Test', 'general', 'Owner');

insert into public.business_members (business_id, auth_user_id, role)
values ('16000000-0000-4000-8000-000000000001', '16000000-0000-4000-8000-000000000002', 'owner');

insert into public.chart_of_accounts (business_id, code, name, type, normal_balance, category)
select '16000000-0000-4000-8000-000000000001', code, name, type, normal_balance, category
from (values
  ('1000', 'Kas', 'asset', 'debit', 'cash'),
  ('2000', 'Utang Usaha', 'liability', 'credit', 'payable'),
  ('5200', 'Beban Gaji', 'expense', 'debit', 'payroll')
) as accounts(code, name, type, normal_balance, category);

insert into public.employees (
  id, business_id, employee_no, name, role, contract_type, status, base_salary,
  joined_at, bpjs_participation, compensation_components
)
values
  ('16000000-0000-4000-8000-000000000003', '16000000-0000-4000-8000-000000000001',
   'A', 'Employee A', 'Staff', 'permanent', 'active', 10000000, '2026-01-01', 'health',
   '[{"id":"bonus","name":"Bonus","type":"earning","calculation":"percentage","amount":10},
     {"id":"deduction","name":"Potongan","type":"deduction","calculation":"fixed","amount":500000}]'),
  ('16000000-0000-4000-8000-000000000004', '16000000-0000-4000-8000-000000000001',
   'B', 'Employee B', 'Staff', 'contract', 'inactive', 3000000, '2026-01-01', 'none', '[]');

select ok(not has_function_privilege('authenticated', 'public.run_payroll_batch(jsonb)', 'EXECUTE'),
  'authenticated clients must use the payroll API');
select ok(not has_table_privilege('authenticated', 'public.payroll_runs', 'INSERT'),
  'authenticated clients cannot write payroll directly');

select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;

select throws_ok($$
  select public.run_payroll_batch('{
    "businessId":"16000000-0000-4000-8000-000000000001",
    "actorUserId":"16000000-0000-4000-8000-000000000005",
    "employeeIds":["16000000-0000-4000-8000-000000000003"],
    "date":"2026-02-28"
  }')
$$, '42501', 'Effective payroll permission is required.', 'a nonmember cannot post payroll');

select throws_ok($$
  select public.run_payroll_batch('{
    "businessId":"16000000-0000-4000-8000-000000000001",
    "actorUserId":"16000000-0000-4000-8000-000000000002",
    "employeeIds":["16000000-0000-4000-8000-000000000003","16000000-0000-4000-8000-000000000004"],
    "date":"2026-02-28"
  }')
$$, '22023', 'Employee is not active.', 'an inactive employee aborts the whole batch');

select is((select count(*) from public.payroll_runs where business_id = '16000000-0000-4000-8000-000000000001'),
  0::bigint, 'failed batch leaves no payroll rows');

select lives_ok($$
  select public.run_payroll_batch('{
    "businessId":"16000000-0000-4000-8000-000000000001",
    "actorUserId":"16000000-0000-4000-8000-000000000002",
    "employeeIds":["16000000-0000-4000-8000-000000000003"],
    "date":"2026-02-28"
  }')
$$, 'an authorized operator can post a batch');

select results_eq($$
  select gross_pay, deductions, net_pay from public.payroll_runs
  where business_id = '16000000-0000-4000-8000-000000000001'
$$, $$ values (11000000::numeric, 610000::numeric, 10390000::numeric) $$,
  'stored components and BPJS determine the payroll');

select results_eq($$
  select account.code, line.debit, line.credit
  from public.payroll_runs as run
  join public.journal_lines as line on line.journal_entry_id = run.journal_entry_id
  join public.chart_of_accounts as account on account.id = line.account_id
  where run.business_id = '16000000-0000-4000-8000-000000000001'
  order by account.code
$$, $$
  values ('1000'::text, 0::numeric, 10390000::numeric),
         ('2000', 0, 500000), ('2210', 0, 550000), ('5200', 11000000, 0), ('5201', 440000, 0)
$$, 'cash, other deductions and both BPJS shares reconcile against expense');

select throws_ok($$
  select public.run_payroll_batch('{
    "businessId":"16000000-0000-4000-8000-000000000001",
    "actorUserId":"16000000-0000-4000-8000-000000000002",
    "employeeIds":["16000000-0000-4000-8000-000000000003"],
    "date":"2026-02-28"
  }')
$$, '23505', 'Payroll for employee 16000000-0000-4000-8000-000000000003 already exists for this period.',
  'a retry cannot create another payroll for the employee and month');

select throws_ok($$
  insert into public.payments (business_id, direction, document_type, document_id, date, amount, method, reference, status)
  select business_id, 'outbound', 'payroll_run', id, '2026-02-28', 1, 'cash', 'PAY-TEST', 'posted'
  from public.payroll_runs where business_id = '16000000-0000-4000-8000-000000000001'
$$, '23514', 'Pembayaran gaji sudah dicatat saat payroll dipost.',
  'a recorded payroll cannot be paid a second time');

select * from finish();
rollback;
