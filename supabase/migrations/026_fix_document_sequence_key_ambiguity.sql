-- Fix document number generation after PostgreSQL reports `sequence_key` as ambiguous.
-- The old PL/pgSQL variable had the same name as public.document_sequences.sequence_key.

create or replace function public.next_document_no(target_business_id uuid, document_prefix text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target_sequence_key text;
  current_value bigint;
begin
  target_sequence_key := document_prefix || '-' || to_char(now(), 'YYYY');

  insert into public.document_sequences (business_id, sequence_key, next_value)
  values (target_business_id, target_sequence_key, 2)
  on conflict (business_id, sequence_key)
  do update set next_value = public.document_sequences.next_value + 1
  returning next_value - 1 into current_value;

  return target_sequence_key || '-' || lpad(current_value::text, 4, '0');
end;
$$;

revoke execute on function public.next_document_no(uuid, text) from public, anon, authenticated;
grant execute on function public.next_document_no(uuid, text) to service_role;
