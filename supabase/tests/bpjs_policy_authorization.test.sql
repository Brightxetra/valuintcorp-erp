begin;

create extension if not exists pgtap with schema extensions;

select plan(31);

select ok(
  has_table_privilege('authenticated', 'public.bpjs_policies', 'SELECT')
  and not has_table_privilege('authenticated', 'public.bpjs_policies', 'INSERT')
  and not has_table_privilege('authenticated', 'public.bpjs_policies', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.bpjs_policies', 'DELETE')
  and not has_table_privilege('authenticated', 'public.bpjs_policies', 'TRUNCATE')
  and not has_table_privilege('authenticated', 'public.bpjs_policies', 'REFERENCES')
  and not has_table_privilege('authenticated', 'public.bpjs_policies', 'TRIGGER'),
  'authenticated can only select BPJS policies directly'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.upsert_bpjs_policy(jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.upsert_bpjs_policy(jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.upsert_bpjs_policy(jsonb)',
    'EXECUTE'
  )
  and exists (
    select 1
    from pg_catalog.pg_proc procedure_record
    where procedure_record.oid = 'public.upsert_bpjs_policy(jsonb)'::regprocedure
      and procedure_record.prosecdef
      and procedure_record.proconfig = array['search_path=pg_catalog']::text[]
  ),
  'only service_role can execute the fixed-path BPJS command'
);

select ok(
  not has_function_privilege(
    'service_role',
    'app_private.upsert_bpjs_policy_internal(jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'app_private.upsert_bpjs_policy_internal(jsonb)',
    'EXECUTE'
  )
  and exists (
    select 1
    from pg_catalog.pg_proc procedure_record
    where procedure_record.oid =
      'app_private.upsert_bpjs_policy_internal(jsonb)'::regprocedure
      and not procedure_record.prosecdef
      and procedure_record.proconfig = array['search_path=pg_catalog']::text[]
  ),
  'the internal BPJS implementation is fixed-path and not API-executable'
);

select is(
  (
    select count(*)
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'bpjs_policies'
      and cmd = 'SELECT'
      and roles = array['authenticated']::name[]
      and coalesce(qual, '') ilike '%member_has_permission%payroll:run%'
  ),
  1::bigint,
  'the only BPJS read policy evaluates effective payroll permission'
);

select is(
  (
    select count(*)
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'bpjs_policies'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  ),
  0::bigint,
  'no direct authenticated BPJS mutation policy remains'
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
    '10000000-0000-4000-8000-00000000d001',
    'BPJS Authorization A',
    'BPJS Authorization A',
    'retail',
    'Owner A'
  ),
  (
    '10000000-0000-4000-8000-00000000d002',
    'BPJS Authorization B',
    'BPJS Authorization B',
    'service',
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
    '10000000-0000-4000-8000-00000000d001',
    '20000000-0000-4000-8000-00000000d001',
    'owner',
    'role',
    '{}'
  ),
  (
    '10000000-0000-4000-8000-00000000d001',
    '20000000-0000-4000-8000-00000000d002',
    'finance_admin',
    'role',
    '{}'
  ),
  (
    '10000000-0000-4000-8000-00000000d001',
    '20000000-0000-4000-8000-00000000d003',
    'hr',
    'custom',
    array['business:read']
  ),
  (
    '10000000-0000-4000-8000-00000000d001',
    '20000000-0000-4000-8000-00000000d004',
    'hr',
    'custom',
    array['business:read', 'payroll:run']
  ),
  (
    '10000000-0000-4000-8000-00000000d001',
    '20000000-0000-4000-8000-00000000d005',
    'hr',
    'custom',
    array['business:read', 'hr:manage']
  ),
  (
    '10000000-0000-4000-8000-00000000d001',
    '20000000-0000-4000-8000-00000000d006',
    'hr',
    'role',
    '{}'
  ),
  (
    '10000000-0000-4000-8000-00000000d002',
    '20000000-0000-4000-8000-00000000d007',
    'owner',
    'role',
    '{}'
  );

insert into public.bpjs_policies (
  id,
  business_id,
  effective_date
)
values
  (
    '30000000-0000-4000-8000-00000000d001',
    '10000000-0000-4000-8000-00000000d001',
    '2026-01-01'
  ),
  (
    '30000000-0000-4000-8000-00000000d002',
    '10000000-0000-4000-8000-00000000d002',
    '2026-01-01'
  );

select is(
  app_private.member_has_permission_for_actor(
    '10000000-0000-4000-8000-00000000d001',
    '20000000-0000-4000-8000-00000000d003',
    'payroll:run'
  ),
  false,
  'custom HR without payroll permission cannot read BPJS policy'
);

select is(
  app_private.member_has_permission_for_actor(
    '10000000-0000-4000-8000-00000000d001',
    '20000000-0000-4000-8000-00000000d002',
    'payroll:run'
  ),
  false,
  'finance administrator does not inherit payroll permission'
);

select is(
  app_private.member_has_permission_for_actor(
    '10000000-0000-4000-8000-00000000d001',
    '20000000-0000-4000-8000-00000000d004',
    'payroll:run'
  ),
  true,
  'custom payroll operator can read BPJS policy'
);

select is(
  app_private.member_has_permission_for_actor(
    '10000000-0000-4000-8000-00000000d001',
    '20000000-0000-4000-8000-00000000d005',
    'payroll:run'
  ),
  false,
  'custom HR manager does not receive implicit BPJS read permission'
);

select is(
  app_private.member_has_permission_for_actor(
    '10000000-0000-4000-8000-00000000d001',
    '20000000-0000-4000-8000-00000000d005',
    'hr:manage'
  ),
  true,
  'custom HR manager retains explicit policy-write permission'
);

select is(
  app_private.member_has_permission_for_actor(
    '10000000-0000-4000-8000-00000000d001',
    '20000000-0000-4000-8000-00000000d006',
    'payroll:run'
  ),
  true,
  'default HR retains payroll read permission'
);

select is(
  app_private.member_has_permission_for_actor(
    '10000000-0000-4000-8000-00000000d001',
    '20000000-0000-4000-8000-00000000d006',
    'hr:manage'
  ),
  true,
  'default HR retains BPJS policy-write permission'
);

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"20000000-0000-4000-8000-00000000d003"}',
  true
);
set local role authenticated;

select is(
  (select count(*) from public.bpjs_policies),
  0::bigint,
  'custom HR without payroll permission sees no BPJS rows'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"20000000-0000-4000-8000-00000000d002"}',
  true
);
set local role authenticated;

select is(
  (select count(*) from public.bpjs_policies),
  0::bigint,
  'finance administrator sees no BPJS rows'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"20000000-0000-4000-8000-00000000d004"}',
  true
);
set local role authenticated;

select is(
  (select count(*) from public.bpjs_policies),
  1::bigint,
  'custom payroll operator sees its tenant BPJS row'
);

select is(
  (
    select count(*)
    from public.bpjs_policies
    where business_id = '10000000-0000-4000-8000-00000000d002'
  ),
  0::bigint,
  'custom payroll operator cannot read another tenant BPJS row'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"20000000-0000-4000-8000-00000000d005"}',
  true
);
set local role authenticated;

select is(
  (select count(*) from public.bpjs_policies),
  0::bigint,
  'custom HR manager cannot bypass the payroll read boundary'
);

select throws_ok(
  $command$
    insert into public.bpjs_policies (business_id)
    values ('10000000-0000-4000-8000-00000000d001')
  $command$,
  '42501',
  'permission denied for table bpjs_policies',
  'authenticated users cannot insert BPJS policies directly'
);

select throws_ok(
  $command$
    update public.bpjs_policies
    set effective_date = '2026-02-01'
    where business_id = '10000000-0000-4000-8000-00000000d001'
  $command$,
  '42501',
  'permission denied for table bpjs_policies',
  'authenticated users cannot update BPJS policies directly'
);

select throws_ok(
  $command$
    delete from public.bpjs_policies
    where business_id = '10000000-0000-4000-8000-00000000d001'
  $command$,
  '42501',
  'permission denied for table bpjs_policies',
  'authenticated users cannot delete BPJS policies directly'
);

select throws_ok(
  $command$
    select public.upsert_bpjs_policy('{}'::jsonb)
  $command$,
  '42501',
  'permission denied for function upsert_bpjs_policy',
  'authenticated users cannot execute the BPJS command directly'
);

reset role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

select throws_ok(
  $command$
    select public.upsert_bpjs_policy(
      '{
        "actorUserId":"20000000-0000-4000-8000-00000000d003",
        "businessId":"10000000-0000-4000-8000-00000000d001",
        "effectiveDate":"2026-08-01",
        "grossSalaryMultiplier":1.1,
        "healthEmployeeRate":0.01,
        "healthEmployerRate":0.04,
        "healthSalaryCap":12000000,
        "jhtEmployeeRate":0.02,
        "jhtEmployerRate":0.037,
        "jhtSalaryCap":15000000,
        "jpnEmployeeRate":0.01,
        "jpnEmployerRate":0.02,
        "jpnSalaryCap":10000000,
        "jkkEmployerRate":0.0054,
        "jkmEmployerRate":0.003
      }'::jsonb
    )
  $command$,
  '42501',
  'Effective HR management permission is required.',
  'custom HR without management permission cannot invoke the command'
);

select throws_ok(
  $command$
    select public.upsert_bpjs_policy(
      '{
        "actorUserId":"20000000-0000-4000-8000-00000000d004",
        "businessId":"10000000-0000-4000-8000-00000000d001",
        "effectiveDate":"2026-08-01",
        "grossSalaryMultiplier":1.1,
        "healthEmployeeRate":0.01,
        "healthEmployerRate":0.04,
        "healthSalaryCap":12000000,
        "jhtEmployeeRate":0.02,
        "jhtEmployerRate":0.037,
        "jhtSalaryCap":15000000,
        "jpnEmployeeRate":0.01,
        "jpnEmployerRate":0.02,
        "jpnSalaryCap":10000000,
        "jkkEmployerRate":0.0054,
        "jkmEmployerRate":0.003
      }'::jsonb
    )
  $command$,
  '42501',
  'Effective HR management permission is required.',
  'payroll-only permission cannot mutate BPJS policy'
);

select throws_ok(
  $command$
    select public.upsert_bpjs_policy(
      '{
        "actorUserId":"20000000-0000-4000-8000-00000000d005",
        "businessId":"10000000-0000-4000-8000-00000000d002",
        "effectiveDate":"2026-08-01",
        "grossSalaryMultiplier":1.1,
        "healthEmployeeRate":0.01,
        "healthEmployerRate":0.04,
        "healthSalaryCap":12000000,
        "jhtEmployeeRate":0.02,
        "jhtEmployerRate":0.037,
        "jhtSalaryCap":15000000,
        "jpnEmployeeRate":0.01,
        "jpnEmployerRate":0.02,
        "jpnSalaryCap":10000000,
        "jkkEmployerRate":0.0054,
        "jkmEmployerRate":0.003
      }'::jsonb
    )
  $command$,
  '42501',
  'Effective HR management permission is required.',
  'HR management permission cannot cross tenant boundaries'
);

select throws_ok(
  $command$
    select public.upsert_bpjs_policy(
      '{
        "actorUserId":"20000000-0000-4000-8000-00000000d005",
        "businessId":"10000000-0000-4000-8000-00000000d001",
        "effectiveDate":"2026-08-01",
        "grossSalaryMultiplier":1.1,
        "healthEmployeeRate":2,
        "healthEmployerRate":0.04,
        "healthSalaryCap":12000000,
        "jhtEmployeeRate":0.02,
        "jhtEmployerRate":0.037,
        "jhtSalaryCap":15000000,
        "jpnEmployeeRate":0.01,
        "jpnEmployerRate":0.02,
        "jpnSalaryCap":10000000,
        "jkkEmployerRate":0.0054,
        "jkmEmployerRate":0.003
      }'::jsonb
    )
  $command$,
  '22023',
  'BPJS policy values are outside the supported range.',
  'the command rejects out-of-range policy values'
);

select lives_ok(
  $command$
    select public.upsert_bpjs_policy(
      '{
        "actorUserId":"20000000-0000-4000-8000-00000000d005",
        "businessId":"10000000-0000-4000-8000-00000000d001",
        "effectiveDate":"2026-08-21",
        "grossSalaryMultiplier":1.2,
        "healthEmployeeRate":0.01,
        "healthEmployerRate":0.04,
        "healthSalaryCap":12500000,
        "jhtEmployeeRate":0.02,
        "jhtEmployerRate":0.037,
        "jhtSalaryCap":15500000,
        "jpnEmployeeRate":0.01,
        "jpnEmployerRate":0.02,
        "jpnSalaryCap":10500000,
        "jkkEmployerRate":0.0054,
        "jkmEmployerRate":0.003
      }'::jsonb
    )
  $command$,
  'custom HR manager can update BPJS policy through the command'
);

reset role;

select is(
  (
    select effective_date::text || '|' || gross_salary_multiplier::text
    from public.bpjs_policies
    where business_id = '10000000-0000-4000-8000-00000000d001'
  ),
  '2026-08-21|1.2000',
  'the authorized command persists the validated BPJS values'
);

select is(
  (
    select count(*)
    from public.activity_events
    where business_id = '10000000-0000-4000-8000-00000000d001'
      and actor_user_id = '20000000-0000-4000-8000-00000000d005'
      and module = 'hr'
      and action = 'updated BPJS policy'
  ),
  1::bigint,
  'the authorized BPJS change records the real actor in the audit trail'
);

select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

select lives_ok(
  $command$
    select public.upsert_bpjs_policy(
      '{
        "actorUserId":"20000000-0000-4000-8000-00000000d001",
        "businessId":"10000000-0000-4000-8000-00000000d001",
        "effectiveDate":"2026-09-01",
        "grossSalaryMultiplier":1.1,
        "healthEmployeeRate":0.01,
        "healthEmployerRate":0.04,
        "healthSalaryCap":12000000,
        "jhtEmployeeRate":0.02,
        "jhtEmployerRate":0.037,
        "jhtSalaryCap":15000000,
        "jpnEmployeeRate":0.01,
        "jpnEmployerRate":0.02,
        "jpnSalaryCap":10000000,
        "jkkEmployerRate":0.0054,
        "jkmEmployerRate":0.003
      }'::jsonb
    )
  $command$,
  'owner override retains legitimate BPJS management behavior'
);

reset role;

select is(
  (
    select count(*)
    from public.bpjs_policies
    where business_id = '10000000-0000-4000-8000-00000000d001'
  ),
  1::bigint,
  'repeated authorized updates retain one BPJS policy per business'
);

select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

select throws_ok(
  $command$
    select public.upsert_bpjs_policy(
      '{"businessId":"10000000-0000-4000-8000-00000000d001"}'::jsonb
    )
  $command$,
  'P0001',
  'actorUserId is required for service-role ERP RPC calls.',
  'the BPJS command cannot run without a bound actor'
);

reset role;

select * from finish();
rollback;
