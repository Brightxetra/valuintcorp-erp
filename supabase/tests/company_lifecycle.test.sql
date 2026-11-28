begin;

create extension if not exists pgtap with schema extensions;
select plan(14);

insert into public.businesses (id, legal_name, display_name, industry, owner_name) values
  ('17000000-0000-4000-8000-000000000001', 'Lifecycle QA', 'Lifecycle QA', 'general', 'Owner'),
  ('17000000-0000-4000-8000-000000000002', 'Other company', 'Other company', 'umkm', 'Owner');

insert into auth.users (id, email, email_confirmed_at)
values ('17000000-0000-4000-8000-000000000012', 'lifecycle-recipient@example.test', now());
insert into public.business_members (business_id, auth_user_id, role) values
  ('17000000-0000-4000-8000-000000000001', '17000000-0000-4000-8000-000000000011', 'owner'),
  ('17000000-0000-4000-8000-000000000001', '17000000-0000-4000-8000-000000000012', 'staff'),
  ('17000000-0000-4000-8000-000000000002', '17000000-0000-4000-8000-000000000011', 'owner');

insert into public.chart_of_accounts (business_id, code, name, type, normal_balance, category)
select '17000000-0000-4000-8000-000000000001', code, name, type, normal_balance, category
from (values ('1000', 'Kas', 'asset', 'debit', 'cash'), ('2200', 'Utang Pajak', 'liability', 'credit', 'payable'),
  ('5200', 'Beban Gaji', 'expense', 'debit', 'payroll')) as accounts(code, name, type, normal_balance, category);

insert into public.employees (id, business_id, employee_no, name, role, contract_type, status, base_salary,
  joined_at, bpjs_participation, monthly_tax_withholding, compensation_components)
values ('17000000-0000-4000-8000-000000000021', '17000000-0000-4000-8000-000000000001',
  'E001', 'Employee QA', 'Staff', 'permanent', 'active', 5000000, '2026-01-01', 'none', 300000,
  '[{"id":"performance","name":"Bonus Performa","type":"earning","calculation":"fixed","amount":500000}]');

select ok(not has_function_privilege('authenticated', 'public.clear_company_data(jsonb)', 'execute'),
  'destructive data command requires the server role');
select throws_ok($$ update public.business_members set role = 'staff' where business_id = '17000000-0000-4000-8000-000000000001' and role = 'owner' $$,
  '42501', 'Akses pemilik hanya dapat diubah via transfer kepemilikan.', 'generic updates cannot demote an owner');

select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;
select set_config('test.lifecycle.transfer', public.change_business_ownership('{
  "action":"request", "businessId":"17000000-0000-4000-8000-000000000001",
  "actorUserId":"17000000-0000-4000-8000-000000000011", "recipientId":"17000000-0000-4000-8000-000000000012"
}')::text, true);
select is((select role from public.business_members where business_id = '17000000-0000-4000-8000-000000000001'
  and auth_user_id = '17000000-0000-4000-8000-000000000012'), 'staff', 'pending transfer leaves recipient unchanged');

select throws_ok($$ select public.change_business_ownership(jsonb_build_object('action', 'accept',
  'businessId', '17000000-0000-4000-8000-000000000001', 'actorUserId', '17000000-0000-4000-8000-000000000011',
  'transferId', current_setting('test.lifecycle.transfer'))) $$, '42501',
  'Akun ini tidak dapat menanggapi permintaan tersebut.', 'requester cannot accept for the recipient');
select lives_ok($$ select public.change_business_ownership(jsonb_build_object('action', 'accept',
  'businessId', '17000000-0000-4000-8000-000000000001', 'actorUserId', '17000000-0000-4000-8000-000000000012',
  'transferId', current_setting('test.lifecycle.transfer'))) $$, 'recipient accepts the ownership transfer');
select results_eq($$ select role, access_scope, access_permissions from public.business_members
  where business_id = '17000000-0000-4000-8000-000000000001' order by auth_user_id $$,
  $$ values ('staff'::text, 'custom'::text, '{}'::text[]), ('owner', 'role', '{}') $$,
  'ownership changes in one operation and the former owner loses owner permissions');

select lives_ok($$ select public.run_payroll_batch('{
  "businessId":"17000000-0000-4000-8000-000000000001", "actorUserId":"17000000-0000-4000-8000-000000000012",
  "employeeIds":["17000000-0000-4000-8000-000000000021"], "date":"2026-02-28"
}') $$, 'payroll uses stored compensation and tax');
select results_eq($$ select gross_pay, tax_withheld, net_pay from public.payroll_runs
  where business_id = '17000000-0000-4000-8000-000000000001' $$,
  $$ values (5500000::numeric, 300000::numeric, 5200000::numeric) $$, 'payroll snapshot records correct net salary and tax');
select is((select sum(line.credit) from public.journal_lines as line
  join public.chart_of_accounts account on account.id = line.account_id
  where line.business_id = '17000000-0000-4000-8000-000000000001' and account.code = '2200'),
  300000::numeric, 'payroll credits the tax payable account');

-- Payroll has committed before an operator starts a data reset.
set constraints all immediate;
set constraints all deferred;

reset role;
insert into public.report_periods (business_id, label, start_date, end_date, locked)
values ('17000000-0000-4000-8000-000000000001', 'Locked', '2026-02-01', '2026-02-28', true);
set local role service_role;
select throws_ok($$ select public.clear_company_data('{
  "action":"reset", "businessId":"17000000-0000-4000-8000-000000000001",
  "actorUserId":"17000000-0000-4000-8000-000000000011", "operationId":"17000000-0000-4000-8000-000000000031"
}') $$, '42501', 'Operasi data hanya tersedia untuk pemilik perusahaan aktif.', 'old owner cannot reset company data');
select lives_ok($$ select public.clear_company_data('{
  "action":"reset", "businessId":"17000000-0000-4000-8000-000000000001",
  "actorUserId":"17000000-0000-4000-8000-000000000012", "operationId":"17000000-0000-4000-8000-000000000031"
}') $$, 'reset clears previously posted data from a locked period');
select ok(not exists (select 1 from public.employees where business_id = '17000000-0000-4000-8000-000000000001')
  and not exists (select 1 from public.journal_entries where business_id = '17000000-0000-4000-8000-000000000001')
  and exists (select 1 from public.customers where business_id = '17000000-0000-4000-8000-000000000001' and code = 'POS-UMUM')
  and exists (select 1 from public.businesses where id = '17000000-0000-4000-8000-000000000002'),
  'reset preserves the POS baseline and the other company');
select lives_ok($$ select public.clear_company_data('{
  "action":"delete", "businessId":"17000000-0000-4000-8000-000000000001",
  "actorUserId":"17000000-0000-4000-8000-000000000012", "operationId":"17000000-0000-4000-8000-000000000032"
}') $$, 'the current owner can remove a company');

select lives_ok('set constraints all immediate', 'posting and tenant deletion leave deferred references and balances valid');

select * from finish();
rollback;
