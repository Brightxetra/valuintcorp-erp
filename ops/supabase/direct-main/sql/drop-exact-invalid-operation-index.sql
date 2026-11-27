\set ON_ERROR_STOP on
\pset pager off
\pset null '<null>'

\if :{?expected_project_ref}
\else
  \echo 'expected_project_ref is required.'
  \quit 2
\endif

set lock_timeout = '5s';
set statement_timeout = '5min';

select
  1 / case
    when :'expected_project_ref' = 'sxhbjwuurkwrnjmnpnix'
      and current_user = 'postgres'
      and current_database() = 'postgres'
      and current_setting('server_version_num')::integer >= 170000
      and current_setting('application_name') =
        'valuintcorp-direct-main:' || :'expected_project_ref' || ':index-recovery'
    then 1
    else 0
  end as direct_main_index_recovery_target_guard;

select
  case
    when count(*) = 1
      and bool_and(not index_record.indisvalid or not index_record.indisready)
      and bool_and(index_record.indislive)
      and bool_and(index_record.indisunique)
      and bool_and(index_record.indnkeyatts = 2)
      and bool_and(index_record.indnatts = 2)
      and bool_and(index_record.indkey[0] = business_column.attnum)
      and bool_and(index_record.indkey[1] = operation_key_column.attnum)
      and bool_and(
        pg_catalog.regexp_replace(
          pg_catalog.lower(
            pg_catalog.pg_get_expr(
              index_record.indpred,
              index_record.indrelid
            )
          ),
          '[[:space:]()]',
          '',
          'g'
        ) = 'operation_keyisnotnull'
      )
      and not exists (
        select 1
        from supabase_migrations.schema_migrations migration_record
        where migration_record.version = '20260722033028'
      )
    then 'true'
    else 'false'
  end as allowed
from pg_catalog.pg_class index_relation
join pg_catalog.pg_namespace index_namespace
  on index_namespace.oid = index_relation.relnamespace
join pg_catalog.pg_index index_record
  on index_record.indexrelid = index_relation.oid
join pg_catalog.pg_attribute business_column
  on business_column.attrelid = index_record.indrelid
  and business_column.attname = 'business_id'
  and not business_column.attisdropped
join pg_catalog.pg_attribute operation_key_column
  on operation_key_column.attrelid = index_record.indrelid
  and operation_key_column.attname = 'operation_key'
  and not operation_key_column.attisdropped
where index_namespace.nspname = 'public'
  and index_relation.relname = 'stock_movements_business_operation_key_uidx'
  and index_record.indrelid = 'public.stock_movements'::pg_catalog.regclass
\gset recovery_

\if :recovery_allowed
  \echo 'Guard passed: dropping only the exact invalid, unrecorded index.'
\else
  \echo 'REFUSED: index is absent, valid, recorded, or does not have the exact reviewed definition.'
  \quit 4
\endif

drop index concurrently public.stock_movements_business_operation_key_uidx;

select
  1 / case
    when pg_catalog.to_regclass(
      'public.stock_movements_business_operation_key_uidx'
    ) is null
    then 1
    else 0
  end as invalid_index_absence_guard;

\echo 'Index is absent. Do not run activation; retry only the still-unrecorded standalone index migration after review.'
