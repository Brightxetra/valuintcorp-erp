begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
declare
  columns_are_ready boolean;
  constraint_is_ready boolean;
  index_is_ready boolean;
begin
  if current_user <> 'postgres' then
    raise exception 'Stock receipt migrations must run as the postgres role.'
      using errcode = '42501';
  end if;

  select
    count(*) = 2
    and bool_and(not column_record.attnotnull)
    and bool_and(
      case column_record.attname
        when 'operation_key' then column_record.atttypid = 'uuid'::regtype
        when 'operation_fingerprint' then column_record.atttypid = 'text'::regtype
        else false
      end
    )
  into columns_are_ready
  from pg_catalog.pg_attribute column_record
  where column_record.attrelid = 'public.stock_movements'::regclass
    and column_record.attname in ('operation_key', 'operation_fingerprint')
    and column_record.attnum > 0
    and not column_record.attisdropped;

  if columns_are_ready is distinct from true then
    raise exception 'Stock receipt operation identity columns are missing or have an incompatible definition.'
      using errcode = '55000';
  end if;

  select
    constraint_record.contype = 'c'
    and regexp_replace(
      lower(pg_catalog.pg_get_expr(
        constraint_record.conbin,
        constraint_record.conrelid
      )),
      '[[:space:]()]',
      '',
      'g'
    ) = 'operation_keyisnull=operation_fingerprintisnull'
  into constraint_is_ready
  from pg_catalog.pg_constraint constraint_record
  where constraint_record.conrelid = 'public.stock_movements'::regclass
    and constraint_record.conname = 'stock_movements_operation_identity_pair_chk';

  if constraint_is_ready is distinct from true then
    raise exception 'Stock receipt operation identity constraint is missing or has an incompatible definition.'
      using errcode = '55000';
  end if;

  select
    index_record.indisvalid
    and index_record.indisready
    and index_record.indisunique
    and index_record.indnkeyatts = 2
    and index_record.indnatts = 2
    and index_record.indkey[0] = business_column.attnum
    and index_record.indkey[1] = operation_key_column.attnum
    and regexp_replace(
      lower(pg_catalog.pg_get_expr(index_record.indpred, index_record.indrelid)),
      '[[:space:]()]',
      '',
      'g'
    ) = 'operation_keyisnotnull'
  into index_is_ready
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
    and index_record.indrelid = 'public.stock_movements'::regclass;

  if index_is_ready is distinct from true then
    raise exception 'Stock receipt operation-key index is missing, invalid, or has the wrong definition.'
      using errcode = '55000';
  end if;
end;
$$;

create or replace function public.post_stock_receipt(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform app_private.apply_request_actor(
    nullif(payload->>'actorUserId', '')::uuid
  );

  return app_private.post_stock_receipt_internal(payload - 'actorUserId');
end;
$$;

alter function public.post_stock_receipt(jsonb) owner to postgres;

comment on function public.post_stock_receipt(jsonb) is
  'Service-role-only actor-bound entry point for idempotent stock receipts.';

revoke all on function public.post_stock_receipt(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.post_stock_receipt(jsonb)
  to service_role;

commit;
