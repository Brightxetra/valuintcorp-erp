begin;

create extension if not exists pgtap with schema extensions;
select plan(8);

select ok(not has_function_privilege('authenticated', 'public.company_report_summary(jsonb)', 'EXECUTE'),
  'company reporting uses the actor-bound API');

insert into public.businesses (id, legal_name, display_name, industry, owner_name, base_currency)
values
  ('17000000-0000-4000-8000-000000000001', 'Company A', 'Company A', 'general', 'Owner A', 'IDR'),
  ('17000000-0000-4000-8000-000000000002', 'Company B', 'Company B', 'umkm', 'Owner B', 'IDR'),
  ('17000000-0000-4000-8000-000000000003', 'Company C', 'Company C', 'general', 'Owner C', 'IDR'),
  ('17000000-0000-4000-8000-000000000004', 'Company D', 'Company D', 'general', 'Owner D', 'USD');

insert into public.business_members (business_id, auth_user_id, role)
select id, '17000000-0000-4000-8000-000000000005', 'owner'
from public.businesses where id in (
  '17000000-0000-4000-8000-000000000001',
  '17000000-0000-4000-8000-000000000002',
  '17000000-0000-4000-8000-000000000004'
);

insert into public.chart_of_accounts (business_id, code, name, type, normal_balance, category)
select id, code, name, type, normal_balance, category
from public.businesses
cross join (values
  ('1000', 'Kas', 'asset', 'debit', 'cash'),
  ('4000', 'Penjualan', 'revenue', 'credit', 'sales')
) as accounts(code, name, type, normal_balance, category)
where id in ('17000000-0000-4000-8000-000000000001', '17000000-0000-4000-8000-000000000002');

do $$
begin
  perform public.create_posted_journal(
    '17000000-0000-4000-8000-000000000001', '2026-01-31', 'January sale', 'manual_transaction', null, 'owner',
    '[{"accountCode":"1000","debit":1000,"credit":0},{"accountCode":"4000","debit":0,"credit":1000}]'
  );
  perform public.create_posted_journal(
    '17000000-0000-4000-8000-000000000002', '2026-02-01', 'February sale', 'manual_transaction', null, 'owner',
    '[{"accountCode":"1000","debit":2000,"credit":0},{"accountCode":"4000","debit":0,"credit":2000}]'
  );
end;
$$;

create function pg_temp.company_report(source uuid, second uuid)
returns jsonb language sql as $$
  select public.company_report_summary(jsonb_build_object(
    'businessId', source,
    'actorUserId', '17000000-0000-4000-8000-000000000005',
    'companyIds', jsonb_build_array('17000000-0000-4000-8000-000000000001', second),
    'startDate', '2026-02-01',
    'endDate', '2026-02-28'
  ));
$$;

grant execute on function pg_temp.company_report(uuid, uuid) to service_role;

select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;

select throws_ok($$
  select pg_temp.company_report('17000000-0000-4000-8000-000000000002', '17000000-0000-4000-8000-000000000002')
$$, '42501', 'Akses laporan General diperlukan.', 'UMKM cannot run group reporting');

select throws_ok($$
  select pg_temp.company_report('17000000-0000-4000-8000-000000000001', '17000000-0000-4000-8000-000000000003')
$$, '42501', 'Akses laporan diperlukan pada setiap perusahaan yang dipilih.', 'each company requires its own membership');

select throws_ok($$
  select pg_temp.company_report('17000000-0000-4000-8000-000000000001', '17000000-0000-4000-8000-000000000004')
$$, '22023', 'Ringkasan gabungan memerlukan mata uang IDR pada semua perusahaan.', 'mixed currencies are rejected');

select results_eq($$
  select row->>'name', (row->>'revenue')::numeric, (row->>'assets')::numeric, (row->>'equity')::numeric
  from jsonb_array_elements(pg_temp.company_report('17000000-0000-4000-8000-000000000001', '17000000-0000-4000-8000-000000000002')->'companies') as source(row)
$$, $$ values ('Company A'::text, 0::numeric, 1000::numeric, 1000::numeric), ('Company B', 2000, 2000, 2000) $$,
  'February results include February income and balances through February for both companies');

select lives_ok($$
  select public.create_business_with_owner_for_actor('Company E', 'Company E', 'general', 'Owner E', null,
    '17000000-0000-4000-8000-000000000005')
$$, 'the same account can create another company');

select is((select count(*) from public.businesses where display_name = 'Company E' and industry = 'general'), 1::bigint,
  'the company uses the requested canonical template');
select is((select count(*) from public.business_feature_flags as flag join public.businesses as business on business.id = flag.business_id
  where business.display_name = 'Company E' and flag.module = 'locations' and flag.enabled), 1::bigint,
  'General template modules are applied in the creation transaction');

select * from finish();
rollback;
