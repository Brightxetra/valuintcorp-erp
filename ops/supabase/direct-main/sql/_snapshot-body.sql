\echo '=== connection and database metadata ==='
select
  clock_timestamp() at time zone 'utc' as captured_at_utc,
  current_database() as database_name,
  current_user as database_role,
  current_setting('server_version') as server_version,
  current_setting('transaction_read_only') as transaction_read_only,
  current_setting('application_name') as application_name,
  pg_database_size(current_database()) as database_bytes;

\echo '=== installed extensions ==='
select
  extension_record.extname as extension_name,
  extension_record.extversion as extension_version,
  namespace_record.nspname as schema_name
from pg_catalog.pg_extension extension_record
join pg_catalog.pg_namespace namespace_record
  on namespace_record.oid = extension_record.extnamespace
order by extension_record.extname;

\echo '=== Supabase migration history (versions only; statements are never emitted) ==='
select migration_record.version
from supabase_migrations.schema_migrations migration_record
order by migration_record.version;

\echo '=== direct relation ACLs for Data API roles ==='
select
  namespace_record.nspname as schema_name,
  relation_record.relname as relation_name,
  case
    when acl_record.grantee = 0 then 'PUBLIC'
    else grantee_role.rolname
  end as grantee,
  acl_record.privilege_type,
  acl_record.is_grantable
from pg_catalog.pg_class relation_record
join pg_catalog.pg_namespace namespace_record
  on namespace_record.oid = relation_record.relnamespace
cross join lateral pg_catalog.aclexplode(
  coalesce(
    relation_record.relacl,
    pg_catalog.acldefault('r', relation_record.relowner)
  )
) acl_record
left join pg_catalog.pg_roles grantee_role
  on grantee_role.oid = acl_record.grantee
where namespace_record.nspname = 'public'
  and relation_record.relkind in ('r', 'p')
  and (
    acl_record.grantee = 0
    or grantee_role.rolname in ('anon', 'authenticated', 'service_role')
  )
order by relation_record.relname, grantee, acl_record.privilege_type;

\echo '=== effective relation privileges for Data API roles ==='
select
  role_record.role_name,
  relation_record.relname as relation_name,
  privilege_record.privilege_name
from pg_catalog.pg_class relation_record
join pg_catalog.pg_namespace namespace_record
  on namespace_record.oid = relation_record.relnamespace
cross join (
  values ('anon'), ('authenticated'), ('service_role')
) role_record(role_name)
cross join (
  values
    ('SELECT'),
    ('INSERT'),
    ('UPDATE'),
    ('DELETE'),
    ('TRUNCATE'),
    ('REFERENCES'),
    ('TRIGGER'),
    ('MAINTAIN')
) privilege_record(privilege_name)
where namespace_record.nspname = 'public'
  and relation_record.relkind in ('r', 'p')
  and pg_catalog.has_table_privilege(
    role_record.role_name,
    relation_record.oid,
    privilege_record.privilege_name
  )
order by role_record.role_name, relation_record.relname, privilege_record.privilege_name;

\echo '=== effective public-schema privileges for Data API roles ==='
select
  role_record.role_name,
  privilege_record.privilege_name
from (
  values ('anon'), ('authenticated'), ('service_role')
) role_record(role_name)
cross join (
  values ('USAGE'), ('CREATE')
) privilege_record(privilege_name)
where pg_catalog.has_schema_privilege(
  role_record.role_name,
  'public',
  privilege_record.privilege_name
)
order by role_record.role_name, privilege_record.privilege_name;

\echo '=== direct sequence ACLs for Data API roles ==='
select
  namespace_record.nspname as schema_name,
  sequence_record.relname as sequence_name,
  case
    when acl_record.grantee = 0 then 'PUBLIC'
    else grantee_role.rolname
  end as grantee,
  acl_record.privilege_type,
  acl_record.is_grantable
from pg_catalog.pg_class sequence_record
join pg_catalog.pg_namespace namespace_record
  on namespace_record.oid = sequence_record.relnamespace
cross join lateral pg_catalog.aclexplode(
  coalesce(
    sequence_record.relacl,
    pg_catalog.acldefault('S', sequence_record.relowner)
  )
) acl_record
left join pg_catalog.pg_roles grantee_role
  on grantee_role.oid = acl_record.grantee
where namespace_record.nspname = 'public'
  and sequence_record.relkind = 'S'
  and (
    acl_record.grantee = 0
    or grantee_role.rolname in ('anon', 'authenticated', 'service_role')
  )
order by sequence_record.relname, grantee, acl_record.privilege_type;

\echo '=== effective sequence privileges for Data API roles ==='
select
  role_record.role_name,
  sequence_record.relname as sequence_name,
  privilege_record.privilege_name
from pg_catalog.pg_class sequence_record
join pg_catalog.pg_namespace namespace_record
  on namespace_record.oid = sequence_record.relnamespace
cross join (
  values ('anon'), ('authenticated'), ('service_role')
) role_record(role_name)
cross join (
  values ('USAGE'), ('SELECT'), ('UPDATE')
) privilege_record(privilege_name)
where namespace_record.nspname = 'public'
  and sequence_record.relkind = 'S'
  and pg_catalog.has_sequence_privilege(
    role_record.role_name,
    sequence_record.oid,
    privilege_record.privilege_name
  )
order by role_record.role_name, sequence_record.relname, privilege_record.privilege_name;

\echo '=== default ACLs ==='
select
  owner_role.rolname as owner_role,
  coalesce(namespace_record.nspname, '<all-schemas>') as schema_scope,
  case default_acl_record.defaclobjtype
    when 'r' then 'table'
    when 'S' then 'sequence'
    when 'f' then 'function'
    when 'T' then 'type'
    when 'n' then 'schema'
    else default_acl_record.defaclobjtype::text
  end as object_type,
  case
    when acl_record.grantee = 0 then 'PUBLIC'
    else grantee_role.rolname
  end as grantee,
  acl_record.privilege_type,
  acl_record.is_grantable
from pg_catalog.pg_default_acl default_acl_record
join pg_catalog.pg_roles owner_role
  on owner_role.oid = default_acl_record.defaclrole
left join pg_catalog.pg_namespace namespace_record
  on namespace_record.oid = default_acl_record.defaclnamespace
cross join lateral pg_catalog.aclexplode(default_acl_record.defaclacl) acl_record
left join pg_catalog.pg_roles grantee_role
  on grantee_role.oid = acl_record.grantee
order by owner_role.rolname, schema_scope, object_type, grantee, acl_record.privilege_type;

\echo '=== routines and security posture (definitions are never emitted) ==='
select
  namespace_record.nspname as schema_name,
  procedure_record.proname as routine_name,
  pg_catalog.pg_get_function_identity_arguments(procedure_record.oid) as identity_arguments,
  procedure_record.prokind as routine_kind,
  procedure_record.prosecdef as security_definer,
  owner_role.rolname as owner_role,
  coalesce(
    pg_catalog.array_to_string(procedure_record.proconfig, ','),
    '<none>'
  ) as routine_configuration
from pg_catalog.pg_proc procedure_record
join pg_catalog.pg_namespace namespace_record
  on namespace_record.oid = procedure_record.pronamespace
join pg_catalog.pg_roles owner_role
  on owner_role.oid = procedure_record.proowner
where namespace_record.nspname in ('public', 'app_private')
order by namespace_record.nspname, procedure_record.proname, identity_arguments;

\echo '=== effective routine EXECUTE grants for Data API roles ==='
select
  namespace_record.nspname as schema_name,
  procedure_record.proname as routine_name,
  pg_catalog.pg_get_function_identity_arguments(procedure_record.oid) as identity_arguments,
  role_record.role_name
from pg_catalog.pg_proc procedure_record
join pg_catalog.pg_namespace namespace_record
  on namespace_record.oid = procedure_record.pronamespace
cross join (
  values ('anon'), ('authenticated'), ('service_role')
) role_record(role_name)
where namespace_record.nspname in ('public', 'app_private')
  and pg_catalog.has_function_privilege(
    role_record.role_name,
    procedure_record.oid,
    'EXECUTE'
  )
order by namespace_record.nspname, procedure_record.proname, identity_arguments, role_record.role_name;

\echo '=== public-table RLS coverage ==='
select
  relation_record.relname as relation_name,
  relation_record.relrowsecurity as rls_enabled,
  relation_record.relforcerowsecurity as rls_forced,
  count(policy_record.oid) as policy_count
from pg_catalog.pg_class relation_record
join pg_catalog.pg_namespace namespace_record
  on namespace_record.oid = relation_record.relnamespace
left join pg_catalog.pg_policy policy_record
  on policy_record.polrelid = relation_record.oid
where namespace_record.nspname = 'public'
  and relation_record.relkind in ('r', 'p')
group by
  relation_record.relname,
  relation_record.relrowsecurity,
  relation_record.relforcerowsecurity
order by relation_record.relname;

\echo '=== public RLS policy matrix (expressions are intentionally omitted) ==='
select
  policy_record.schemaname as schema_name,
  policy_record.tablename as relation_name,
  policy_record.policyname as policy_name,
  policy_record.permissive,
  pg_catalog.array_to_string(policy_record.roles, ',') as roles,
  policy_record.cmd as command
from pg_catalog.pg_policies policy_record
where policy_record.schemaname = 'public'
order by policy_record.tablename, policy_record.policyname;

\echo '=== aggregate session state (queries and client addresses are intentionally omitted) ==='
select
  coalesce(activity_record.usename, '<background>') as database_role,
  activity_record.backend_type,
  coalesce(activity_record.state, '<none>') as session_state,
  coalesce(activity_record.wait_event_type, '<none>') as wait_event_type,
  coalesce(activity_record.wait_event, '<none>') as wait_event,
  count(*) as session_count,
  coalesce(
    max(clock_timestamp() - activity_record.xact_start)
      filter (where activity_record.xact_start is not null),
    interval '0'
  ) as oldest_transaction_age
from pg_catalog.pg_stat_activity activity_record
where activity_record.datname = current_database()
group by
  activity_record.usename,
  activity_record.backend_type,
  activity_record.state,
  activity_record.wait_event_type,
  activity_record.wait_event
order by database_role, backend_type, session_state, wait_event_type, wait_event;

\echo '=== aggregate lock state ==='
select
  lock_record.locktype,
  lock_record.mode,
  lock_record.granted,
  count(*) as lock_count
from pg_catalog.pg_locks lock_record
left join pg_catalog.pg_database database_record
  on database_record.oid = lock_record.database
where lock_record.database is null
  or database_record.datname = current_database()
group by lock_record.locktype, lock_record.mode, lock_record.granted
order by lock_record.granted, lock_record.locktype, lock_record.mode;

\echo '=== stock-receipt operation columns ==='
select
  attribute_record.attname as column_name,
  pg_catalog.format_type(
    attribute_record.atttypid,
    attribute_record.atttypmod
  ) as data_type,
  attribute_record.attnotnull as not_null
from pg_catalog.pg_attribute attribute_record
where attribute_record.attrelid = pg_catalog.to_regclass('public.stock_movements')
  and attribute_record.attname in ('operation_key', 'operation_fingerprint')
  and attribute_record.attnum > 0
  and not attribute_record.attisdropped
order by attribute_record.attname;

\echo '=== stock-receipt operation constraint ==='
select
  constraint_record.conname as constraint_name,
  constraint_record.contype as constraint_type,
  constraint_record.convalidated as validated,
  pg_catalog.pg_get_constraintdef(constraint_record.oid, true) as definition
from pg_catalog.pg_constraint constraint_record
where constraint_record.conrelid = pg_catalog.to_regclass('public.stock_movements')
  and constraint_record.conname = 'stock_movements_operation_identity_pair_chk';

\echo '=== stock-receipt operation-key index ==='
select
  index_namespace.nspname as schema_name,
  index_relation.relname as index_name,
  index_record.indisunique as unique_index,
  index_record.indisready as ready,
  index_record.indisvalid as valid,
  index_record.indislive as live,
  index_record.indnkeyatts as key_attribute_count,
  index_record.indnatts as total_attribute_count,
  pg_catalog.pg_get_expr(
    index_record.indpred,
    index_record.indrelid
  ) as predicate,
  pg_catalog.pg_get_indexdef(index_record.indexrelid) as definition
from pg_catalog.pg_class index_relation
join pg_catalog.pg_namespace index_namespace
  on index_namespace.oid = index_relation.relnamespace
join pg_catalog.pg_index index_record
  on index_record.indexrelid = index_relation.oid
where index_namespace.nspname = 'public'
  and index_relation.relname = 'stock_movements_business_operation_key_uidx';

\echo '=== stock-receipt identity violations and duplicate keys, when columns exist ==='
select (
  count(*) = 2
)::text as operation_identity_columns_exist
from pg_catalog.pg_attribute attribute_record
where attribute_record.attrelid = pg_catalog.to_regclass('public.stock_movements')
  and attribute_record.attname in ('operation_key', 'operation_fingerprint')
  and attribute_record.attnum > 0
  and not attribute_record.attisdropped
\gset snapshot_

\if :snapshot_operation_identity_columns_exist
  select count(*)::bigint as identity_pair_violation_count
  from public.stock_movements movement_record
  where (movement_record.operation_key is null)
    <> (movement_record.operation_fingerprint is null);

  select count(*)::bigint as duplicate_operation_key_group_count
  from (
    select
      movement_record.business_id,
      movement_record.operation_key
    from public.stock_movements movement_record
    where movement_record.operation_key is not null
    group by
      movement_record.business_id,
      movement_record.operation_key
    having count(*) > 1
  ) duplicate_group;
\else
  \echo 'Operation identity columns are not installed; violation checks skipped.'
\endif

\echo '=== exact public-table row counts (counts only; no business rows are emitted) ==='
select pg_catalog.format(
  'select %L::text as relation_name, count(*)::bigint as exact_row_count from %I.%I;',
  namespace_record.nspname || '.' || relation_record.relname,
  namespace_record.nspname,
  relation_record.relname
)
from pg_catalog.pg_class relation_record
join pg_catalog.pg_namespace namespace_record
  on namespace_record.oid = relation_record.relnamespace
where namespace_record.nspname = 'public'
  and relation_record.relkind in ('r', 'p')
order by relation_record.relname
\gexec

\echo '=== bounded Supabase-managed row counts (counts only) ==='
select 'auth.users'::text as relation_name, count(*)::bigint as exact_row_count
from auth.users
union all
select 'storage.buckets', count(*)::bigint
from storage.buckets
union all
select 'storage.objects', count(*)::bigint
from storage.objects
order by relation_name;
