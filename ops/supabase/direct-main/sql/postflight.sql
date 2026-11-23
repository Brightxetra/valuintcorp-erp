\set ON_ERROR_STOP on
\pset pager off
\pset null '<null>'

\if :{?expected_project_ref}
\else
  \echo 'expected_project_ref is required.'
  \quit 2
\endif

begin isolation level repeatable read, read only;

set local lock_timeout = '3s';
set local statement_timeout = '30s';
set local idle_in_transaction_session_timeout = '60s';

select
  1 / case
    when :'expected_project_ref' = 'sxhbjwuurkwrnjmnpnix'
      and current_user = 'postgres'
      and current_database() = 'postgres'
      and current_setting('server_version_num')::integer >= 170000
      and current_setting('transaction_read_only') = 'on'
      and current_setting('application_name') =
        'valuintcorp-direct-main:' || :'expected_project_ref' || ':postflight'
    then 1
    else 0
  end as direct_main_read_only_target_guard;

\echo '=== postflight assertion: complete reviewed migration history ==='
with expected_migration(version) as (
  select unnest(array[
    '001', '002', '003', '004', '005', '006', '007', '008', '009',
    '010', '011', '012', '013', '014', '015', '016', '017', '018',
    '019', '020', '021', '022', '023', '024', '025', '026', '027',
    '20260705004700',
    '20260719072824',
    '20260719081805',
    '20260722033028',
    '20260722033031',
    '20260723071330',
    '20260723071331',
    '20260821070246',
    '20260821074131',
    '20260821083243',
    '20260821085938',
    '20260821093118',
    '20260821100726',
    '20260821104115',
    '20260821110627'
  ]::text[])
),
missing_migration as (
  select expected_migration.version
  from expected_migration
  where not exists (
    select 1
    from supabase_migrations.schema_migrations applied_migration
    where applied_migration.version = expected_migration.version
  )
)
select
  1 / case when count(*) = 0 then 1 else 0 end
    as complete_migration_history_guard
from missing_migration;

\echo '=== postflight assertion: operation identity columns and constraint ==='
select
  1 / case
    when count(*) = 2
      and bool_and(not attribute_record.attnotnull)
      and bool_and(
        case attribute_record.attname
          when 'operation_key'
            then attribute_record.atttypid = 'uuid'::pg_catalog.regtype
          when 'operation_fingerprint'
            then attribute_record.atttypid = 'text'::pg_catalog.regtype
          else false
        end
      )
    then 1
    else 0
  end as operation_columns_guard
from pg_catalog.pg_attribute attribute_record
where attribute_record.attrelid = 'public.stock_movements'::pg_catalog.regclass
  and attribute_record.attname in ('operation_key', 'operation_fingerprint')
  and attribute_record.attnum > 0
  and not attribute_record.attisdropped;

select
  1 / case
    when count(*) = 1
      and bool_and(constraint_record.contype = 'c')
      and bool_and(constraint_record.convalidated)
      and bool_and(
        pg_catalog.regexp_replace(
          pg_catalog.lower(
            pg_catalog.pg_get_expr(
              constraint_record.conbin,
              constraint_record.conrelid
            )
          ),
          '[[:space:]()]',
          '',
          'g'
        ) = 'operation_keyisnull=operation_fingerprintisnull'
      )
    then 1
    else 0
  end as operation_constraint_guard
from pg_catalog.pg_constraint constraint_record
where constraint_record.conrelid = 'public.stock_movements'::pg_catalog.regclass
  and constraint_record.conname = 'stock_movements_operation_identity_pair_chk';

\echo '=== postflight assertion: exact ready/valid operation-key index ==='
select
  1 / case
    when count(*) = 1
      and bool_and(index_record.indisvalid)
      and bool_and(index_record.indisready)
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
    then 1
    else 0
  end as operation_index_guard
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
  and index_record.indrelid = 'public.stock_movements'::pg_catalog.regclass;

\echo '=== postflight assertion: service-only public RPC and private helpers ==='
select
  1 / case
    when procedure_record.oid is not null
      and procedure_record.prosecdef
      and owner_role.rolname = 'postgres'
      and procedure_record.proconfig @> array['search_path=pg_catalog']::text[]
      and pg_catalog.has_function_privilege(
        'service_role',
        procedure_record.oid,
        'EXECUTE'
      )
      and not pg_catalog.has_function_privilege(
        'anon',
        procedure_record.oid,
        'EXECUTE'
      )
      and not pg_catalog.has_function_privilege(
        'authenticated',
        procedure_record.oid,
        'EXECUTE'
      )
    then 1
    else 0
  end as public_stock_receipt_rpc_guard
from (
  select pg_catalog.to_regprocedure('public.post_stock_receipt(jsonb)') as oid
) expected_procedure
left join pg_catalog.pg_proc procedure_record
  on procedure_record.oid = expected_procedure.oid
left join pg_catalog.pg_roles owner_role
  on owner_role.oid = procedure_record.proowner;

with protected_routine(signature) as (
  values
    ('app_private.protect_stock_movement_operation_key()'),
    ('app_private.lock_stock_movement_posting_window()'),
    ('app_private.post_stock_receipt_internal(jsonb)'),
    ('app_private.lock_report_period_posting_window()'),
    ('app_private.lock_pos_sale_inventory_keys(jsonb)'),
    ('public.set_report_period_lock_internal(jsonb)'),
    ('public.post_pos_sale_internal(jsonb)')
),
resolved_routine as (
  select
    protected_routine.signature,
    pg_catalog.to_regprocedure(protected_routine.signature) as oid
  from protected_routine
)
select
  1 / case
    when count(*) = 7
      and bool_and(resolved_routine.oid is not null)
      and bool_and(
        not pg_catalog.has_function_privilege(
          'anon',
          resolved_routine.oid,
          'EXECUTE'
        )
      )
      and bool_and(
        not pg_catalog.has_function_privilege(
          'authenticated',
          resolved_routine.oid,
          'EXECUTE'
        )
      )
      and bool_and(
        not pg_catalog.has_function_privilege(
          'service_role',
          resolved_routine.oid,
          'EXECUTE'
        )
      )
    then 1
    else 0
  end as protected_routines_guard
from resolved_routine;

select
  1 / case
    when procedure_record.oid is not null
      and procedure_record.prosecdef
      and owner_role.rolname = 'postgres'
      and procedure_record.proconfig @> array['search_path=pg_catalog']::text[]
      and pg_catalog.has_function_privilege(
        'service_role',
        procedure_record.oid,
        'EXECUTE'
      )
      and not pg_catalog.has_function_privilege(
        'anon',
        procedure_record.oid,
        'EXECUTE'
      )
      and not pg_catalog.has_function_privilege(
        'authenticated',
        procedure_record.oid,
        'EXECUTE'
      )
    then 1
    else 0
  end as public_pos_sale_rpc_guard
from (
  select pg_catalog.to_regprocedure('public.post_pos_sale(jsonb)') as oid
) expected_procedure
left join pg_catalog.pg_proc procedure_record
  on procedure_record.oid = expected_procedure.oid
left join pg_catalog.pg_roles owner_role
  on owner_role.oid = procedure_record.proowner;

select
  1 / case
    when procedure_record.oid is not null
      and not procedure_record.prosecdef
      and procedure_record.proconfig @> array['search_path=pg_catalog']::text[]
      and pg_catalog.pg_get_functiondef(procedure_record.oid)
        ilike '%order by affected_item.item_id%'
      and pg_catalog.pg_get_functiondef(procedure_record.oid)
        ilike '%inventory-stock|%'
    then 1
    else 0
  end as canonical_pos_inventory_lock_definition_guard
from (
  select pg_catalog.to_regprocedure(
    'app_private.lock_pos_sale_inventory_keys(jsonb)'
  ) as oid
) expected_procedure
left join pg_catalog.pg_proc procedure_record
  on procedure_record.oid = expected_procedure.oid;

\echo '=== postflight assertion: security-remediation command wrappers ==='
with expected_service_routine(signature) as (
  values
    ('public.accept_pending_member_invites_for_user(jsonb)'),
    ('public.upsert_bpjs_policy(jsonb)'),
    ('public.post_pos_sale_v2(jsonb)'),
    ('public.post_payment(jsonb)'),
    ('public.post_purchase_bill(jsonb)'),
    ('public.post_sales_invoice(jsonb)'),
    ('public.post_stock_receipt(jsonb)'),
    ('public.post_stock_adjustment(jsonb)'),
    ('public.post_stock_transfer(jsonb)'),
    ('public.void_document(jsonb)'),
    ('public.reconciliation_rollup(uuid,uuid,uuid,text,date,date,integer)'),
    ('public.next_document_no(uuid,text)')
),
resolved_service_routine as (
  select
    expected_service_routine.signature,
    pg_catalog.to_regprocedure(expected_service_routine.signature) as oid
  from expected_service_routine
)
select
  1 / case
    when count(*) = 12
      and bool_and(resolved_service_routine.oid is not null)
      and bool_and(procedure_record.prosecdef)
      and bool_and(owner_role.rolname = 'postgres')
      and bool_and(
        procedure_record.proconfig @> array['search_path=pg_catalog']::text[]
      )
      and bool_and(
        pg_catalog.has_function_privilege(
          'service_role',
          resolved_service_routine.oid,
          'EXECUTE'
        )
      )
      and bool_and(
        not pg_catalog.has_function_privilege(
          'anon',
          resolved_service_routine.oid,
          'EXECUTE'
        )
      )
      and bool_and(
        not pg_catalog.has_function_privilege(
          'authenticated',
          resolved_service_routine.oid,
          'EXECUTE'
        )
      )
    then 1
    else 0
  end as security_remediation_service_routine_guard
from resolved_service_routine
left join pg_catalog.pg_proc procedure_record
  on procedure_record.oid = resolved_service_routine.oid
left join pg_catalog.pg_roles owner_role
  on owner_role.oid = procedure_record.proowner;

with protected_remediation_routine(signature) as (
  values
    ('app_private.upsert_bpjs_policy_internal(jsonb)'),
    ('public.post_payment_internal(jsonb)'),
    ('public.post_purchase_bill_internal(jsonb)'),
    ('public.post_sales_invoice_internal(jsonb)'),
    ('public.void_document_internal(jsonb)'),
    ('app_private.void_inventory_document_internal(jsonb)'),
    ('app_private.post_stock_receipt_internal(jsonb)'),
    ('public.post_stock_adjustment_internal(jsonb)'),
    ('public.post_stock_transfer_internal(jsonb)'),
    ('public.post_branch_expense_internal(jsonb)'),
    ('public.create_posted_journal(uuid,date,text,text,uuid,text,jsonb)')
),
resolved_protected_remediation_routine as (
  select
    protected_remediation_routine.signature,
    pg_catalog.to_regprocedure(protected_remediation_routine.signature) as oid
  from protected_remediation_routine
)
select
  1 / case
    when count(*) = 11
      and bool_and(resolved_protected_remediation_routine.oid is not null)
      and bool_and(
        not pg_catalog.has_function_privilege(
          'anon',
          resolved_protected_remediation_routine.oid,
          'EXECUTE'
        )
      )
      and bool_and(
        not pg_catalog.has_function_privilege(
          'authenticated',
          resolved_protected_remediation_routine.oid,
          'EXECUTE'
        )
      )
      and bool_and(
        not pg_catalog.has_function_privilege(
          'service_role',
          resolved_protected_remediation_routine.oid,
          'EXECUTE'
        )
      )
    then 1
    else 0
  end as protected_security_remediation_routines_guard
from resolved_protected_remediation_routine;

\echo '=== postflight assertion: command-only table privileges ==='
with command_only_table(table_name, authenticated_select) as (
  values
    ('branch_expenses', true),
    ('payments', true),
    ('payment_allocations', true),
    ('purchase_bills', true),
    ('purchase_bill_lines', true),
    ('sales_invoices', true),
    ('sales_invoice_lines', true),
    ('journal_entries', true),
    ('journal_lines', true),
    ('stock_movements', true),
    ('stock_adjustments', true),
    ('stock_transfers', true),
    ('bpjs_policies', true),
    ('attachments', true),
    ('user_login_sessions', false),
    ('document_sequences', false)
),
resolved_command_only_table as (
  select
    command_only_table.*,
    pg_catalog.to_regclass(
      pg_catalog.format('public.%I', command_only_table.table_name)
    ) as relation_oid
  from command_only_table
)
select
  1 / case
    when count(*) = 16
      and bool_and(relation_oid is not null)
      and bool_and(
        pg_catalog.has_table_privilege(
          'authenticated',
          relation_oid,
          'SELECT'
        ) = authenticated_select
      )
      and bool_and(
        not pg_catalog.has_table_privilege(
          'authenticated',
          relation_oid,
          'INSERT'
        )
      )
      and bool_and(
        not pg_catalog.has_table_privilege(
          'authenticated',
          relation_oid,
          'UPDATE'
        )
      )
      and bool_and(
        not pg_catalog.has_table_privilege(
          'authenticated',
          relation_oid,
          'DELETE'
        )
      )
    then 1
    else 0
  end as command_only_table_privilege_guard
from resolved_command_only_table;

\echo '=== postflight assertion: Supabase session binding ==='
select
  1 / case
    when count(*) = 1
      and bool_and(attribute_record.atttypid = 'uuid'::pg_catalog.regtype)
      and bool_and(attribute_record.attnotnull)
      and exists (
        select 1
        from pg_catalog.pg_class index_relation
        join pg_catalog.pg_namespace index_namespace
          on index_namespace.oid = index_relation.relnamespace
        join pg_catalog.pg_index index_record
          on index_record.indexrelid = index_relation.oid
        where index_namespace.nspname = 'public'
          and index_relation.relname = 'user_login_sessions_supabase_session_uidx'
          and index_record.indrelid = 'public.user_login_sessions'::pg_catalog.regclass
          and index_record.indisunique
          and index_record.indisready
          and index_record.indisvalid
      )
      and not exists (
        select 1
        from public.user_login_sessions login_session
        where login_session.supabase_session_id is null
      )
    then 1
    else 0
  end as supabase_session_binding_guard
from pg_catalog.pg_attribute attribute_record
where attribute_record.attrelid = 'public.user_login_sessions'::pg_catalog.regclass
  and attribute_record.attname = 'supabase_session_id'
  and not attribute_record.attisdropped;

\echo '=== postflight assertion: required triggers enabled ==='
with expected_trigger(trigger_name, relation_name) as (
  values
    ('protect_stock_movement_operation_key', 'stock_movements'),
    ('coordinate_stock_movement_posting_window', 'stock_movements'),
    ('lock_report_period_posting_window', 'report_periods')
)
select
  1 / case
    when count(*) = 3
      and bool_and(trigger_record.oid is not null)
      and bool_and(trigger_record.tgenabled <> 'D')
    then 1
    else 0
  end as stock_receipt_trigger_guard
from expected_trigger
left join pg_catalog.pg_trigger trigger_record
  on trigger_record.tgrelid = pg_catalog.to_regclass(
    pg_catalog.format('public.%I', expected_trigger.relation_name)
  )
  and trigger_record.tgname = expected_trigger.trigger_name
  and not trigger_record.tgisinternal;

\echo '=== postflight assertion: RLS enabled on every public table ==='
select
  1 / case
    when count(*) > 0 and bool_and(relation_record.relrowsecurity)
    then 1
    else 0
  end as public_rls_guard
from pg_catalog.pg_class relation_record
join pg_catalog.pg_namespace namespace_record
  on namespace_record.oid = relation_record.relnamespace
where namespace_record.nspname = 'public'
  and relation_record.relkind in ('r', 'p');

\echo '=== postflight assertion: no non-CRUD Data API table privileges ==='
with forbidden_privilege(privilege_name) as (
  values ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')
),
data_api_role(role_name) as (
  values ('anon'), ('authenticated')
)
select
  1 / case when count(*) = 0 then 1 else 0 end
    as no_non_crud_data_api_privileges_guard
from pg_catalog.pg_class relation_record
join pg_catalog.pg_namespace namespace_record
  on namespace_record.oid = relation_record.relnamespace
cross join forbidden_privilege
cross join data_api_role
where namespace_record.nspname = 'public'
  and relation_record.relkind in ('r', 'p')
  and pg_catalog.has_table_privilege(
    data_api_role.role_name,
    relation_record.oid,
    forbidden_privilege.privilege_name
  );

\echo '=== postflight assertion: postgres global/public defaults do not auto-expose objects ==='
select
  1 / case when count(*) = 0 then 1 else 0 end
    as hardened_postgres_default_acl_guard
from pg_catalog.pg_default_acl default_acl_record
join pg_catalog.pg_roles owner_role
  on owner_role.oid = default_acl_record.defaclrole
cross join lateral pg_catalog.aclexplode(default_acl_record.defaclacl) acl_record
left join pg_catalog.pg_roles grantee_role
  on grantee_role.oid = acl_record.grantee
where owner_role.rolname = 'postgres'
  and default_acl_record.defaclnamespace in (
    0,
    'public'::pg_catalog.regnamespace
  )
  and (
    (
      default_acl_record.defaclobjtype in ('r', 'S')
      and (
        acl_record.grantee = 0
        or grantee_role.rolname in ('anon', 'authenticated', 'service_role')
      )
    )
    or (
      default_acl_record.defaclobjtype = 'f'
      and (
        acl_record.grantee = 0
        or grantee_role.rolname in ('anon', 'authenticated', 'service_role')
      )
      and acl_record.privilege_type = 'EXECUTE'
    )
  );

\ir _snapshot-body.sql

commit;
