begin;

create extension if not exists pgtap with schema extensions;

select plan(20);

select is(
  current_user::text,
  'postgres',
  'document sequence rehearsal runs as the migration owner'
);

select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.document_sequences'::regclass),
  'row level security remains enabled on document sequence state'
);

select is(
  (
    select count(*)
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'document_sequences'
  ),
  0::bigint,
  'the service-only document sequence table has no client policy'
);

select ok(
  not has_table_privilege('authenticated', 'public.document_sequences', 'SELECT')
  and not has_table_privilege('authenticated', 'public.document_sequences', 'INSERT')
  and not has_table_privilege('authenticated', 'public.document_sequences', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.document_sequences', 'DELETE'),
  'authenticated clients cannot read or mutate document sequence state'
);

select ok(
  not has_table_privilege('anon', 'public.document_sequences', 'SELECT')
  and not has_table_privilege('anon', 'public.document_sequences', 'INSERT')
  and not has_table_privilege('anon', 'public.document_sequences', 'UPDATE')
  and not has_table_privilege('anon', 'public.document_sequences', 'DELETE'),
  'anonymous clients have no document sequence table privilege'
);

select ok(
  not has_table_privilege('public', 'public.document_sequences', 'SELECT')
  and not has_table_privilege('public', 'public.document_sequences', 'INSERT')
  and not has_table_privilege('public', 'public.document_sequences', 'UPDATE')
  and not has_table_privilege('public', 'public.document_sequences', 'DELETE'),
  'PUBLIC has no document sequence table privilege'
);

select ok(
  has_table_privilege('service_role', 'public.document_sequences', 'SELECT')
  and has_table_privilege('service_role', 'public.document_sequences', 'INSERT')
  and has_table_privilege('service_role', 'public.document_sequences', 'UPDATE')
  and has_table_privilege('service_role', 'public.document_sequences', 'DELETE'),
  'service role retains only the table operations needed by the allocator'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.next_document_no(uuid,text)',
    'EXECUTE'
  ),
  'authenticated clients cannot execute the allocator directly'
);

select ok(
  not has_function_privilege('anon', 'public.next_document_no(uuid,text)', 'EXECUTE')
  and not has_function_privilege('public', 'public.next_document_no(uuid,text)', 'EXECUTE'),
  'anonymous and PUBLIC callers cannot execute the allocator'
);

select ok(
  has_function_privilege('service_role', 'public.next_document_no(uuid,text)', 'EXECUTE'),
  'service role can execute the allocator'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_proc procedure_record
    where procedure_record.oid = 'public.next_document_no(uuid,text)'::regprocedure
      and procedure_record.prosecdef
      and procedure_record.proconfig = array['search_path=pg_catalog']::text[]
  ),
  'the allocator is a fixed-path security definer'
);

select ok(
  pg_catalog.pg_get_functiondef('public.next_document_no(uuid,text)'::regprocedure)
    ilike '%insert into public.document_sequences as sequence_state%on conflict (business_id, sequence_key)%do update%returning next_value - 1%',
  'allocation remains one atomic conflict-locked statement'
);

insert into public.businesses (
  id, legal_name, display_name, industry, owner_name
)
values
  (
    '71000000-0000-4000-8000-000000000001',
    'Sequence Tenant A', 'Sequence Tenant A', 'general', 'Owner A'
  ),
  (
    '71000000-0000-4000-8000-000000000002',
    'Sequence Tenant B', 'Sequence Tenant B', 'general', 'Owner B'
  );

select set_config(
  'request.jwt.claims',
  '{"sub":"72000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select throws_ok(
  $$insert into public.document_sequences (
      business_id, sequence_key, next_value
    ) values (
      '71000000-0000-4000-8000-000000000001', 'P109-RESET', 1
    )$$,
  '42501',
  'permission denied for table document_sequences',
  'authenticated cannot create arbitrary sequence state'
);

select throws_ok(
  $$update public.document_sequences set next_value = 1 where false$$,
  '42501',
  'permission denied for table document_sequences',
  'authenticated cannot reset sequence state'
);

select throws_ok(
  $$delete from public.document_sequences where false$$,
  '42501',
  'permission denied for table document_sequences',
  'authenticated cannot delete sequence state'
);

reset role;
set local role service_role;

select is(
  public.next_document_no(
    '71000000-0000-4000-8000-000000000001',
    'P109'
  ),
  'P109-' || pg_catalog.to_char(pg_catalog.now(), 'YYYY') || '-0001',
  'the first allocation starts at one'
);

select is(
  public.next_document_no(
    '71000000-0000-4000-8000-000000000001',
    'P109'
  ),
  'P109-' || pg_catalog.to_char(pg_catalog.now(), 'YYYY') || '-0002',
  'a repeated allocation advances exactly once'
);

select is(
  public.next_document_no(
    '71000000-0000-4000-8000-000000000002',
    'P109'
  ),
  'P109-' || pg_catalog.to_char(pg_catalog.now(), 'YYYY') || '-0001',
  'separate businesses retain independent counters'
);

with allocations as materialized (
  select public.next_document_no(
    '71000000-0000-4000-8000-000000000001',
    'P109'
  ) as document_no
  from pg_catalog.generate_series(1, 25)
)
select is(
  (select count(distinct document_no) from allocations),
  25::bigint,
  'a burst of allocations produces no duplicate number'
);

select is(
  (
    select next_value
    from public.document_sequences
    where business_id = '71000000-0000-4000-8000-000000000001'
      and sequence_key = 'P109-' || pg_catalog.to_char(pg_catalog.now(), 'YYYY')
  ),
  28::bigint,
  'the allocator advances monotonically without a lost update'
);

reset role;

select * from finish();

rollback;
