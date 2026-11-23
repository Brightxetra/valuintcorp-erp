begin;

create extension if not exists pgtap with schema extensions;

select plan(13);

select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_login_sessions'
      and column_name = 'supabase_session_id'
      and data_type = 'uuid'
  ),
  'application sessions store the verified Supabase session UUID'
);

select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_login_sessions'
      and column_name = 'supabase_session_id'
      and is_nullable = 'NO'
  ),
  'the Supabase session binding is mandatory'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_indexes
    where schemaname = 'public'
      and tablename = 'user_login_sessions'
      and indexname = 'user_login_sessions_supabase_session_uidx'
      and indexdef ilike 'create unique index%'
  ),
  'one Supabase session can register only one application session'
);

select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.user_login_sessions'::regclass),
  'row level security remains enabled'
);

select is(
  (
    select count(*)
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'user_login_sessions'
  ),
  0::bigint,
  'the service-only session registry has no direct client policy'
);

select ok(
  not has_table_privilege('authenticated', 'public.user_login_sessions', 'SELECT')
  and not has_table_privilege('authenticated', 'public.user_login_sessions', 'INSERT')
  and not has_table_privilege('authenticated', 'public.user_login_sessions', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.user_login_sessions', 'DELETE'),
  'authenticated clients cannot read or mutate the session registry directly'
);

select ok(
  not has_table_privilege('anon', 'public.user_login_sessions', 'SELECT')
  and not has_table_privilege('anon', 'public.user_login_sessions', 'INSERT')
  and not has_table_privilege('anon', 'public.user_login_sessions', 'UPDATE')
  and not has_table_privilege('anon', 'public.user_login_sessions', 'DELETE'),
  'anonymous clients have no session registry privilege'
);

select ok(
  not has_table_privilege('public', 'public.user_login_sessions', 'SELECT')
  and not has_table_privilege('public', 'public.user_login_sessions', 'INSERT')
  and not has_table_privilege('public', 'public.user_login_sessions', 'UPDATE')
  and not has_table_privilege('public', 'public.user_login_sessions', 'DELETE'),
  'PUBLIC has no session registry privilege'
);

select ok(
  has_table_privilege('service_role', 'public.user_login_sessions', 'SELECT')
  and has_table_privilege('service_role', 'public.user_login_sessions', 'INSERT')
  and has_table_privilege('service_role', 'public.user_login_sessions', 'UPDATE')
  and has_table_privilege('service_role', 'public.user_login_sessions', 'DELETE'),
  'the trusted service role retains the required session registry privileges'
);

select lives_ok(
  $$insert into public.user_login_sessions (
      auth_user_id, supabase_session_id, session_token_hash
    ) values (
      '81000000-0000-4000-8000-000000000001',
      '82000000-0000-4000-8000-000000000001',
      'p108-valid-session-hash'
    )$$,
  'a fully bound application session can be inserted'
);

select throws_ok(
  $$insert into public.user_login_sessions (
      auth_user_id, supabase_session_id, session_token_hash
    ) values (
      '81000000-0000-4000-8000-000000000002',
      null,
      'p108-null-session-hash'
    )$$,
  '23502',
  null,
  'an unbound application session is rejected'
);

select throws_ok(
  $$insert into public.user_login_sessions (
      auth_user_id, supabase_session_id, session_token_hash
    ) values (
      '81000000-0000-4000-8000-000000000002',
      '82000000-0000-4000-8000-000000000001',
      'p108-duplicate-supabase-session-hash'
    )$$,
  '23505',
  null,
  'a Supabase session cannot mint a second application session'
);

select is(
  (
    select count(*)
    from public.user_login_sessions
    where supabase_session_id is null
  ),
  0::bigint,
  'no legacy row remains without a Supabase session binding'
);

select * from finish();

rollback;
