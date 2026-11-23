-- Document numbers are authoritative accounting/inventory state. Browser roles
-- must never read, reset, delete, or recreate the backing counters directly.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '60s';

do $guard$
begin
  if current_user <> 'postgres' then
    raise exception 'Document sequence authority migration must run as postgres.';
  end if;
end
$guard$;

revoke all privileges on table public.document_sequences
  from public, anon, authenticated;
grant select, insert, update, delete on table public.document_sequences
  to service_role;

-- Remove both the original FOR ALL policy and the later split policies. The
-- service role bypasses RLS and the application exposes no direct table path.
do $policies$
declare
  policy_record record;
begin
  for policy_record in
    select policy.polname
    from pg_catalog.pg_policy policy
    join pg_catalog.pg_class relation on relation.oid = policy.polrelid
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'document_sequences'
  loop
    execute pg_catalog.format(
      'drop policy %I on public.document_sequences',
      policy_record.polname
    );
  end loop;
end
$policies$;

-- One statement performs creation/allocation under the primary-key conflict
-- lock. This preserves a short, atomic, per-business/per-key critical section.
create or replace function public.next_document_no(
  target_business_id uuid,
  document_prefix text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  target_sequence_key text;
  current_value bigint;
begin
  target_sequence_key := document_prefix || '-' ||
    pg_catalog.to_char(pg_catalog.now(), 'YYYY');

  insert into public.document_sequences as sequence_state (
    business_id,
    sequence_key,
    next_value
  )
  values (
    target_business_id,
    target_sequence_key,
    2
  )
  on conflict (business_id, sequence_key)
  do update
    set next_value = sequence_state.next_value + 1
  returning next_value - 1 into current_value;

  return target_sequence_key || '-' ||
    pg_catalog.lpad(current_value::text, 4, '0');
end
$function$;

revoke all on function public.next_document_no(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.next_document_no(uuid, text)
  to service_role;

commit;
