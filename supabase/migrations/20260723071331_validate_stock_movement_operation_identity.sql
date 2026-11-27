begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
declare
  constraint_is_ready boolean;
begin
  if current_user <> 'postgres' then
    raise exception 'Stock movement identity validation must run as the postgres role.'
      using errcode = '42501';
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
    raise exception 'Stock movement operation identity constraint is missing or has an incompatible definition.'
      using errcode = '55000';
  end if;
end;
$$;

alter table public.stock_movements
  validate constraint stock_movements_operation_identity_pair_chk;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint constraint_record
    where constraint_record.conrelid = 'public.stock_movements'::regclass
      and constraint_record.conname = 'stock_movements_operation_identity_pair_chk'
      and constraint_record.convalidated
  ) then
    raise exception 'Stock movement operation identity constraint validation did not complete.'
      using errcode = '55000';
  end if;
end;
$$;

comment on constraint stock_movements_operation_identity_pair_chk
  on public.stock_movements is
  'Validated invariant: operation_key and operation_fingerprint are either both NULL or both present.';

commit;
