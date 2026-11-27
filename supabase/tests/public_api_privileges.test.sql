begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

select is(
  current_user::text,
  'postgres',
  'ACL rehearsal runs as the application migration owner'
);

select is(
  (
    select count(*)
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind in ('v', 'm', 'f')
  ),
  0::bigint,
  'public relation kinds still match the verified table-only baseline'
);

with api_roles(role_name) as (
  values ('anon'::text), ('authenticated'::text)
), non_crud_privileges(privilege_name) as (
  values
    ('TRUNCATE'::text),
    ('REFERENCES'::text),
    ('TRIGGER'::text),
    ('MAINTAIN'::text)
), current_tables(table_oid) as (
  select relation.oid
  from pg_class relation
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relkind in ('r', 'p')
)
select is(
  (
    select count(*)
    from api_roles
    cross join non_crud_privileges
    cross join current_tables
    where has_table_privilege(role_name, table_oid, privilege_name)
  ),
  0::bigint,
  'anon and authenticated have no effective non-CRUD privilege on current public tables'
);

select is(
  (
    select count(*)
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    cross join lateral aclexplode(relation.relacl) acl
    where namespace.nspname = 'public'
      and relation.relkind in ('r', 'p')
      and acl.grantee = 0
      and upper(acl.privilege_type) in ('TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN')
  ),
  0::bigint,
  'PUBLIC has no direct non-CRUD privilege on current public tables'
);

with current_tables(table_oid) as (
  select relation.oid
  from pg_class relation
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relkind in ('r', 'p')
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
    from current_tables
    cross join table_privileges
    where not has_table_privilege('service_role', table_oid, privilege_name)
  ),
  0::bigint,
  'service_role retains the verified production table privilege matrix'
);

with read_only_tables(table_name) as (
  values
    ('audit_logs'::text),
    ('industry_templates'::text),
    ('demo_user_accounts'::text),
    ('demo_sandboxes'::text)
)
select is(
  (
    select count(*)
    from read_only_tables
    where not has_table_privilege(
      'authenticated',
      format('public.%I', table_name),
      'SELECT'
    )
  ),
  0::bigint,
  'authenticated can select the four conservative compatibility tables'
);

with read_only_tables(table_name) as (
  values
    ('audit_logs'::text),
    ('industry_templates'::text),
    ('demo_user_accounts'::text),
    ('demo_sandboxes'::text)
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
    from read_only_tables
    cross join denied_privileges
    where has_table_privilege(
      'authenticated',
      format('public.%I', table_name),
      privilege_name
    )
  ),
  0::bigint,
  'authenticated has no write or non-CRUD privilege on the four read-only tables'
);

with required_privileges(privilege_name) as (
  values ('SELECT'::text), ('INSERT'::text)
)
select is(
  (
    select count(*)
    from required_privileges
    where not has_table_privilege(
      'authenticated',
      'public.activity_events',
      privilege_name
    )
  ),
  0::bigint,
  'authenticated retains SELECT and INSERT on activity_events'
);

with denied_privileges(privilege_name) as (
  values
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
    from denied_privileges
    where has_table_privilege(
      'authenticated',
      'public.activity_events',
      privilege_name
    )
  ),
  0::bigint,
  'authenticated has no extra privilege on activity_events'
);

with contained_tables(table_name) as (
  values
    ('audit_logs'::text),
    ('industry_templates'::text),
    ('demo_user_accounts'::text),
    ('demo_sandboxes'::text),
    ('activity_events'::text)
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
    from contained_tables
    cross join table_privileges
    where has_table_privilege(
      'anon',
      format('public.%I', table_name),
      privilege_name
    )
  ),
  0::bigint,
  'anon has no table privilege on the five contained tables'
);

create table public.acl_default_table_probe_20260719 (
  id bigint primary key
);

create sequence public.acl_default_sequence_probe_20260719;

create function public.acl_default_function_probe_20260719()
returns integer
language sql
as $$
  select 1
$$;

with api_roles(role_name) as (
  values ('anon'::text), ('authenticated'::text), ('service_role'::text)
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
    from api_roles
    cross join table_privileges
    where has_table_privilege(
      role_name,
      'public.acl_default_table_probe_20260719',
      privilege_name
    )
  ),
  0::bigint,
  'future postgres-owned public tables require explicit Data API grants'
);

select is(
  (
    select count(*)
    from pg_class relation
    cross join lateral aclexplode(relation.relacl) acl
    where relation.oid = 'public.acl_default_table_probe_20260719'::regclass
      and acl.grantee = 0
  ),
  0::bigint,
  'future postgres-owned public tables grant nothing directly to PUBLIC'
);

with api_roles(role_name) as (
  values ('anon'::text), ('authenticated'::text), ('service_role'::text)
), sequence_privileges(privilege_name) as (
  values ('USAGE'::text), ('SELECT'::text), ('UPDATE'::text)
)
select is(
  (
    select count(*)
    from api_roles
    cross join sequence_privileges
    where has_sequence_privilege(
      role_name,
      'public.acl_default_sequence_probe_20260719',
      privilege_name
    )
  ),
  0::bigint,
  'future postgres-owned public sequences require explicit Data API grants'
);

select is(
  (
    select count(*)
    from pg_class relation
    cross join lateral aclexplode(relation.relacl) acl
    where relation.oid = 'public.acl_default_sequence_probe_20260719'::regclass
      and acl.grantee = 0
  ),
  0::bigint,
  'future postgres-owned public sequences grant nothing directly to PUBLIC'
);

with api_roles(role_name) as (
  values ('anon'::text), ('authenticated'::text), ('service_role'::text)
)
select is(
  (
    select count(*)
    from api_roles
    where has_function_privilege(
      role_name,
      'public.acl_default_function_probe_20260719()',
      'EXECUTE'
    )
  ),
  0::bigint,
  'future postgres-owned functions require explicit EXECUTE grants'
);

select is(
  (
    select count(*)
    from pg_proc routine
    cross join lateral aclexplode(
      coalesce(routine.proacl, acldefault('f', routine.proowner))
    ) acl
    where routine.oid = 'public.acl_default_function_probe_20260719()'::regprocedure
      and acl.grantee = 0
      and upper(acl.privilege_type) = 'EXECUTE'
  ),
  0::bigint,
  'future postgres-owned functions grant no EXECUTE directly to PUBLIC'
);

select * from finish();

rollback;
