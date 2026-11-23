begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
begin
  if current_user <> 'postgres' then
    raise exception 'Inventory document command-only migrations must run as the postgres role.';
  end if;
end;
$$;

-- Inventory history is readable through its retained SELECT policies, but no
-- browser role may create, rewrite, or erase posted inventory effects directly.
revoke all privileges on table
  public.stock_movements,
  public.stock_adjustments,
  public.stock_transfers
from public, anon, authenticated;

grant select on table
  public.stock_movements,
  public.stock_adjustments,
  public.stock_transfers
to authenticated;

-- Remove both the legacy FOR ALL policies and the later split write policies.
-- Read authorization remains in scope for P1-07 and is deliberately preserved.
do $$
declare
  policy_record record;
begin
  for policy_record in
    select
      namespace.nspname as schema_name,
      relation.relname as table_name,
      policy.polname as policy_name
    from pg_catalog.pg_policy policy
    join pg_catalog.pg_class relation on relation.oid = policy.polrelid
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = any(array[
        'stock_movements',
        'stock_adjustments',
        'stock_transfers'
      ])
      and policy.polcmd <> 'r'
  loop
    execute pg_catalog.format(
      'drop policy %I on %I.%I',
      policy_record.policy_name,
      policy_record.schema_name,
      policy_record.table_name
    );
  end loop;
end;
$$;

-- A role-scoped member may operate every warehouse in the business. A custom
-- member must be assigned to an active location backed by the target warehouse.
create or replace function app_private.member_has_warehouse_access(
  target_business_id uuid,
  target_warehouse_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce((
    select case
      when member.role in ('owner', 'system_admin')
        or member.access_scope = 'role'
      then true
      else exists (
        select 1
        from public.locations location
        where location.business_id = target_business_id
          and location.warehouse_id = target_warehouse_id
          and location.is_active = true
          and location.id = any(coalesce(member.location_ids, '{}'::uuid[]))
      )
    end
    from public.business_members member
    where member.business_id = target_business_id
      and member.auth_user_id = auth.uid()
      and target_warehouse_id is not null
    limit 1
  ), false);
$$;

alter function app_private.member_has_warehouse_access(uuid, uuid)
owner to postgres;

revoke all on function app_private.member_has_warehouse_access(uuid, uuid)
from public, anon, authenticated, service_role;

-- Rebind every inventory posting command to the trusted actor injected by the
-- application server. Caller-supplied actorUserId is stripped before dispatch.
create or replace function public.post_stock_receipt(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  trusted_payload jsonb := payload - 'actorUserId';
  target_business_id uuid := nullif(trusted_payload->>'businessId', '')::uuid;
  target_warehouse_id uuid := nullif(trusted_payload->>'warehouseId', '')::uuid;
begin
  perform app_private.apply_request_actor(
    nullif(payload->>'actorUserId', '')::uuid
  );

  if target_business_id is null
    or not app_private.member_has_permission(target_business_id, 'inventory:manage')
  then
    raise exception 'You are not allowed to perform inventory:manage.'
      using errcode = '42501';
  end if;

  if target_warehouse_id is null
    or not app_private.member_has_warehouse_access(
      target_business_id,
      target_warehouse_id
    )
  then
    raise exception 'Actor is not assigned to this inventory warehouse.'
      using errcode = '42501';
  end if;

  return app_private.post_stock_receipt_internal(trusted_payload);
end;
$$;

create or replace function public.post_stock_adjustment(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  trusted_payload jsonb := payload - 'actorUserId';
  target_business_id uuid := nullif(trusted_payload->>'businessId', '')::uuid;
  target_warehouse_id uuid := nullif(trusted_payload->>'warehouseId', '')::uuid;
begin
  perform app_private.apply_request_actor(
    nullif(payload->>'actorUserId', '')::uuid
  );

  if target_business_id is null
    or not app_private.member_has_permission(target_business_id, 'inventory:manage')
  then
    raise exception 'Actor lacks inventory:manage permission for this business.'
      using errcode = '42501';
  end if;

  if target_warehouse_id is null
    or not app_private.member_has_warehouse_access(
      target_business_id,
      target_warehouse_id
    )
  then
    raise exception 'Actor is not assigned to this inventory warehouse.'
      using errcode = '42501';
  end if;

  return public.post_stock_adjustment_internal(trusted_payload);
end;
$$;

create or replace function public.post_stock_transfer(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  trusted_payload jsonb := payload - 'actorUserId';
  target_business_id uuid := nullif(trusted_payload->>'businessId', '')::uuid;
  from_warehouse_id uuid := nullif(trusted_payload->>'fromWarehouseId', '')::uuid;
  to_warehouse_id uuid := nullif(trusted_payload->>'toWarehouseId', '')::uuid;
begin
  perform app_private.apply_request_actor(
    nullif(payload->>'actorUserId', '')::uuid
  );

  if target_business_id is null
    or not app_private.member_has_permission(target_business_id, 'inventory:manage')
  then
    raise exception 'Actor lacks inventory:manage permission for this business.'
      using errcode = '42501';
  end if;

  if from_warehouse_id is null
    or to_warehouse_id is null
    or not app_private.member_has_warehouse_access(
      target_business_id,
      from_warehouse_id
    )
    or not app_private.member_has_warehouse_access(
      target_business_id,
      to_warehouse_id
    )
  then
    raise exception 'Actor is not assigned to every inventory warehouse in this transfer.'
      using errcode = '42501';
  end if;

  return public.post_stock_transfer_internal(trusted_payload);
end;
$$;

-- Inventory reversals use their own locked implementation. Financial document
-- reversal remains delegated to the P1-06A internal routine without semantic
-- changes, while adjustment/transfer replay is rejected before duplicate effects.
create or replace function app_private.void_inventory_document_internal(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  target_business_id uuid := nullif(payload->>'businessId', '')::uuid;
  target_document_type text := payload->>'documentType';
  target_document_id uuid := nullif(payload->>'documentId', '')::uuid;
  void_date date := nullif(payload->>'date', '')::date;
  void_reason text := nullif(pg_catalog.btrim(payload->>'reason'), '');
  adjustment_record record;
  transfer_record record;
  original_journal_id uuid;
  reversal_id uuid;
  reversal_lines jsonb;
  actor_role text;
begin
  if target_business_id is null
    or target_document_id is null
    or void_date is null
    or void_reason is null
    or target_document_type not in ('stock_adjustment', 'stock_transfer')
  then
    raise exception 'A valid inventory document, void date, and reason are required.'
      using errcode = '22023';
  end if;

  actor_role := public.require_posting_role(
    target_business_id,
    array['owner', 'finance_admin', 'staff', 'system_admin']
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'inventory-void|' || target_business_id::text || '|'
        || target_document_type || '|' || target_document_id::text,
      0
    )
  );

  if public.is_period_locked(target_business_id, void_date) then
    raise exception 'Void date is inside a locked period.'
      using errcode = '55000';
  end if;

  if target_document_type = 'stock_adjustment' then
    select adjustment.*
    into adjustment_record
    from public.stock_adjustments adjustment
    where adjustment.id = target_document_id
      and adjustment.business_id = target_business_id
      and adjustment.status = 'posted'
    for update;

    if adjustment_record.id is null then
      raise exception 'Inventory document is missing or already void.'
        using errcode = '55000';
    end if;

    original_journal_id := adjustment_record.journal_entry_id;

    update public.stock_adjustments adjustment
    set status = 'void'
    where adjustment.id = adjustment_record.id;

    if original_journal_id is null then
      raise exception 'Posted stock adjustment has no journal to reverse.'
        using errcode = '55000';
    end if;

    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'accountCode', account.code,
        'debit', journal_line.credit,
        'credit', journal_line.debit,
        'memo', 'Void stock_adjustment'
      )
    )
    into reversal_lines
    from public.journal_lines journal_line
    join public.chart_of_accounts account on account.id = journal_line.account_id
    where journal_line.journal_entry_id = original_journal_id;

    reversal_id := public.create_posted_journal(
      target_business_id,
      void_date,
      'Reversal stock_adjustment ' || target_document_id::text,
      'reversal',
      target_document_id,
      actor_role,
      coalesce(reversal_lines, '[]'::jsonb)
    );

    update public.journal_entries journal
    set
      status = 'reversed',
      reversed_entry_id = reversal_id
    where journal.id = original_journal_id
      and journal.business_id = target_business_id;

    insert into public.stock_movements (
      business_id,
      item_id,
      warehouse_id,
      date,
      type,
      quantity,
      value,
      journal_entry_id,
      memo
    )
    select
      movement.business_id,
      movement.item_id,
      movement.warehouse_id,
      void_date,
      case
        when movement.type in ('sale', 'transfer_out', 'adjustment_out')
          then 'adjustment_in'
        else 'adjustment_out'
      end,
      movement.quantity,
      movement.value,
      reversal_id,
      'Void ' || coalesce(movement.memo, target_document_id::text)
    from public.stock_movements movement
    where movement.business_id = target_business_id
      and movement.journal_entry_id = original_journal_id;
  else
    select transfer.*
    into transfer_record
    from public.stock_transfers transfer
    where transfer.id = target_document_id
      and transfer.business_id = target_business_id
      and transfer.status = 'posted'
    for update;

    if transfer_record.id is null then
      raise exception 'Inventory document is missing or already void.'
        using errcode = '55000';
    end if;

    update public.stock_transfers transfer
    set status = 'void'
    where transfer.id = transfer_record.id;

    insert into public.stock_movements (
      business_id,
      item_id,
      warehouse_id,
      date,
      type,
      quantity,
      value,
      memo
    )
    values
      (
        target_business_id,
        transfer_record.item_id,
        transfer_record.from_warehouse_id,
        void_date,
        'transfer_in',
        transfer_record.quantity,
        0,
        'Void ' || transfer_record.transfer_no
      ),
      (
        target_business_id,
        transfer_record.item_id,
        transfer_record.to_warehouse_id,
        void_date,
        'transfer_out',
        transfer_record.quantity,
        0,
        'Void ' || transfer_record.transfer_no
      );
  end if;

  insert into public.activity_events (
    business_id,
    actor_user_id,
    actor_name,
    module,
    action,
    description
  )
  values (
    target_business_id,
    auth.uid(),
    coalesce(auth.uid()::text, 'System'),
    'inventory',
    'document voided',
    target_document_type || ' ' || target_document_id::text
      || ' voided by role ' || actor_role || ': ' || void_reason
  );

  return coalesce(reversal_id, target_document_id);
end;
$$;

alter function app_private.void_inventory_document_internal(jsonb)
owner to postgres;

revoke all on function app_private.void_inventory_document_internal(jsonb)
from public, anon, authenticated, service_role;

create or replace function public.void_document(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  trusted_payload jsonb := payload - 'actorUserId';
  target_business_id uuid := nullif(trusted_payload->>'businessId', '')::uuid;
  target_document_type text := trusted_payload->>'documentType';
  target_document_id uuid := nullif(trusted_payload->>'documentId', '')::uuid;
  first_warehouse_id uuid;
  second_warehouse_id uuid;
begin
  perform app_private.apply_request_actor(
    nullif(payload->>'actorUserId', '')::uuid
  );

  if target_document_type = 'stock_adjustment' then
    if target_business_id is null
      or not app_private.member_has_permission(target_business_id, 'inventory:manage')
    then
      raise exception 'Actor lacks inventory:manage permission for this business.'
        using errcode = '42501';
    end if;

    select adjustment.warehouse_id
    into first_warehouse_id
    from public.stock_adjustments adjustment
    where adjustment.id = target_document_id
      and adjustment.business_id = target_business_id
      and adjustment.status = 'posted';

    if first_warehouse_id is null
      or not app_private.member_has_warehouse_access(
        target_business_id,
        first_warehouse_id
      )
    then
      raise exception 'Inventory document is unavailable at an assigned warehouse.'
        using errcode = '42501';
    end if;

    return app_private.void_inventory_document_internal(trusted_payload);
  elsif target_document_type = 'stock_transfer' then
    if target_business_id is null
      or not app_private.member_has_permission(target_business_id, 'inventory:manage')
    then
      raise exception 'Actor lacks inventory:manage permission for this business.'
        using errcode = '42501';
    end if;

    select
      transfer.from_warehouse_id,
      transfer.to_warehouse_id
    into
      first_warehouse_id,
      second_warehouse_id
    from public.stock_transfers transfer
    where transfer.id = target_document_id
      and transfer.business_id = target_business_id
      and transfer.status = 'posted';

    if first_warehouse_id is null
      or second_warehouse_id is null
      or not app_private.member_has_warehouse_access(
        target_business_id,
        first_warehouse_id
      )
      or not app_private.member_has_warehouse_access(
        target_business_id,
        second_warehouse_id
      )
    then
      raise exception 'Inventory document is unavailable at every assigned warehouse.'
        using errcode = '42501';
    end if;

    return app_private.void_inventory_document_internal(trusted_payload);
  end if;

  if target_business_id is null
    or not app_private.member_has_permission(target_business_id, 'accounting:write')
  then
    raise exception 'Actor lacks accounting:write permission for this business.'
      using errcode = '42501';
  end if;

  return public.void_document_internal(trusted_payload);
end;
$$;

alter function public.post_stock_receipt(jsonb) owner to postgres;
alter function public.post_stock_adjustment(jsonb) owner to postgres;
alter function public.post_stock_transfer(jsonb) owner to postgres;
alter function public.void_document(jsonb) owner to postgres;

revoke all on function public.post_stock_receipt(jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.post_stock_adjustment(jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.post_stock_transfer(jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.void_document(jsonb)
from public, anon, authenticated, service_role;

grant execute on function public.post_stock_receipt(jsonb) to service_role;
grant execute on function public.post_stock_adjustment(jsonb) to service_role;
grant execute on function public.post_stock_transfer(jsonb) to service_role;
grant execute on function public.void_document(jsonb) to service_role;

-- Every implementation detail is owner-only. The service role must enter through
-- the actor-bound public wrappers above.
revoke all on function app_private.post_stock_receipt_internal(jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.post_stock_adjustment_internal(jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.post_stock_transfer_internal(jsonb)
from public, anon, authenticated, service_role;

commit;
