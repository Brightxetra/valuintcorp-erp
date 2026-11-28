begin;

create function public.bootstrap_first_business(
  legal_name text, display_name text, industry text, owner_name text, tax_id text, actor_user_id uuid
) returns uuid
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare existing_business_id uuid;
begin
  if actor_user_id is null then
    raise exception 'Akun diperlukan untuk membuat perusahaan.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('first-business:' || actor_user_id::text, 0));
  select member.business_id into existing_business_id
  from public.business_members as member where member.auth_user_id = actor_user_id
  order by member.created_at, member.business_id limit 1;

  return coalesce(existing_business_id, public.create_business_with_owner_for_actor(
    legal_name, display_name, industry, owner_name, tax_id, actor_user_id
  ));
end;
$$;

create table public.business_ownership_transfers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  requested_by uuid not null,
  recipient_id uuid not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  created_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null default (statement_timestamp() + interval '7 days'),
  resolved_at timestamptz,
  check (requested_by <> recipient_id)
);

create unique index business_ownership_transfers_one_pending
  on public.business_ownership_transfers (business_id) where status = 'pending';
create index business_ownership_transfers_company_idx on public.business_ownership_transfers (business_id);
create index business_ownership_transfers_recipient_idx on public.business_ownership_transfers (recipient_id) where status = 'pending';
alter table public.business_ownership_transfers enable row level security;
revoke all on public.business_ownership_transfers from public, anon, authenticated, service_role;
grant select on public.business_ownership_transfers to authenticated;
create policy "participants can read ownership transfers" on public.business_ownership_transfers
  for select to authenticated
  using (
    ((select auth.uid()) in (requested_by, recipient_id) and app_private.is_business_member(business_id))
    or app_private.has_business_role(business_id, array['owner'])
  );

create function app_private.protect_privileged_membership() returns trigger
language plpgsql security invoker set search_path = pg_catalog as $$
begin
  if (old.role in ('owner', 'system_admin') or new.role in ('owner', 'system_admin'))
    and (current_user <> 'postgres' or current_setting('app.ownership_transfer_business', true) is distinct from old.business_id::text) then
    raise exception 'Akses pemilik hanya dapat diubah via transfer kepemilikan.' using errcode = '42501';
  end if;
  if old.business_id is distinct from new.business_id or old.auth_user_id is distinct from new.auth_user_id then
    raise exception 'Identitas keanggotaan tidak dapat diubah.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function app_private.protect_privileged_membership() from public, anon, authenticated, service_role;
create trigger protect_privileged_membership
before update on public.business_members for each row execute function app_private.protect_privileged_membership();

create policy "privileged memberships cannot be removed" on public.business_members
  as restrictive for delete to authenticated using (role not in ('owner', 'system_admin'));

create policy "delegated admins can manage bounded memberships" on public.business_members
  for update to authenticated
  using (role not in ('owner', 'system_admin') and auth_user_id <> (select auth.uid())
    and app_private.member_invite_assignment_allowed(business_id, role, access_scope, access_permissions, location_ids))
  with check (role not in ('owner', 'system_admin')
    and app_private.member_invite_assignment_allowed(business_id, role, access_scope, access_permissions, location_ids));

create policy "membership edits must be bounded" on public.business_members
  as restrictive for update to authenticated
  using (role not in ('owner', 'system_admin') and auth_user_id <> (select auth.uid())
    and (app_private.has_business_role(business_id, array['owner', 'system_admin'])
      or app_private.member_invite_assignment_allowed(business_id, role, access_scope, access_permissions, location_ids)))
  with check (role not in ('owner', 'system_admin')
    and app_private.member_invite_assignment_allowed(business_id, role, access_scope, access_permissions, location_ids));

create policy "membership adds must be bounded" on public.business_members
  as restrictive for insert to authenticated
  with check (role not in ('owner', 'system_admin')
    and app_private.member_invite_assignment_allowed(business_id, role, access_scope, access_permissions, location_ids));

create policy "privileged roles cannot be invited" on public.member_invites
  as restrictive for insert to authenticated with check (role not in ('owner', 'system_admin'));

update public.member_invites set status = 'revoked'
where status = 'pending' and role in ('owner', 'system_admin');

create function public.change_business_ownership(payload jsonb) returns uuid
language plpgsql security definer set search_path = pg_catalog as $$
declare
  company_id uuid := (payload->>'businessId')::uuid;
  actor_id uuid := (payload->>'actorUserId')::uuid;
  recipient uuid := (payload->>'recipientId')::uuid;
  action text := payload->>'action';
  transfer public.business_ownership_transfers%rowtype;
  actor_role text;
  requester_role text;
  recipient_role text;
begin
  perform app_private.apply_request_actor(actor_id);
  perform 1 from public.businesses where id = company_id for update;
  if not found then raise exception 'Perusahaan tidak ditemukan.' using errcode = '22023'; end if;

  select member.role into actor_role from public.business_members as member
  where member.business_id = company_id and member.auth_user_id = actor_id for update;

  if action = 'request' then
    if actor_role is distinct from 'owner' then
      raise exception 'Hanya pemilik yang dapat meminta transfer.' using errcode = '42501';
    end if;
    if recipient is null or recipient = actor_id or not exists (
      select 1 from public.business_members as member join auth.users as account on account.id = member.auth_user_id
      where member.business_id = company_id and member.auth_user_id = recipient
        and member.role not in ('owner', 'system_admin') and account.email_confirmed_at is not null
    ) then
      raise exception 'Pilih anggota aktif dengan email terverifikasi.' using errcode = '22023';
    end if;
    update public.business_ownership_transfers set status = 'expired', resolved_at = statement_timestamp()
      where business_id = company_id and status = 'pending' and expires_at <= statement_timestamp();
    insert into public.business_ownership_transfers (business_id, requested_by, recipient_id)
      values (company_id, actor_id, recipient) returning * into transfer;
    return transfer.id;
  end if;

  select * into transfer from public.business_ownership_transfers
  where business_id = company_id and id = (payload->>'transferId')::uuid for update;
  if not found or transfer.status <> 'pending' or transfer.expires_at <= statement_timestamp() or actor_role is null then
    raise exception 'Permintaan transfer sudah berakhir.' using errcode = '22023';
  end if;

  if action in ('accept', 'decline') and actor_id <> transfer.recipient_id
    or action = 'cancel' and (actor_id <> transfer.requested_by or actor_role <> 'owner')
    or action is null or action not in ('accept', 'decline', 'cancel') then
    raise exception 'Akun ini tidak dapat menanggapi permintaan tersebut.' using errcode = '42501';
  end if;

  if action = 'accept' then
    select role into requester_role from public.business_members
      where business_id = company_id and auth_user_id = transfer.requested_by for update;
    select role into recipient_role from public.business_members
      where business_id = company_id and auth_user_id = transfer.recipient_id for update;
    if requester_role is distinct from 'owner' or recipient_role is null or recipient_role in ('owner', 'system_admin') then
      raise exception 'Keanggotaan berubah. Buat permintaan transfer baru.' using errcode = '42501';
    end if;

    perform set_config('app.ownership_transfer_business', company_id::text, true);
    update public.business_members set
      role = case when auth_user_id = transfer.recipient_id then 'owner' else 'staff' end,
      access_scope = case when auth_user_id = transfer.recipient_id then 'role' else 'custom' end,
      access_permissions = '{}', location_ids = '{}'
    where business_id = company_id and auth_user_id in (transfer.requested_by, transfer.recipient_id);
    perform set_config('app.ownership_transfer_business', '', true);

    update public.businesses as business set owner_name = account.name
    from (select coalesce(nullif(raw_user_meta_data->>'name', ''), email, 'Owner') as name
          from auth.users where id = actor_id) as account
    where business.id = company_id;

    insert into public.activity_events (business_id, actor_user_id, actor_name, module, action, description)
    values (company_id, actor_id, 'Owner', 'accounting', 'ownership_transferred', 'Transfer kepemilikan diterima.');
  end if;

  update public.business_ownership_transfers
    set status = case action when 'accept' then 'accepted' when 'decline' then 'declined' else 'cancelled' end,
        resolved_at = statement_timestamp()
    where id = transfer.id;
  return transfer.id;
end;
$$;

create table public.company_data_operations (
  id uuid primary key,
  business_id uuid not null,
  actor_id uuid not null,
  action text not null check (action in ('reset', 'delete')),
  storage_bucket text not null,
  storage_paths text[] not null default '{}',
  completed_at timestamptz not null default statement_timestamp()
);
alter table public.company_data_operations enable row level security;
revoke all on public.company_data_operations from public, anon, authenticated, service_role;
grant select, update (storage_paths) on public.company_data_operations to service_role;

create function public.clear_company_data(payload jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog set lock_timeout = '5s' as $$
declare
  company_id uuid := (payload->>'businessId')::uuid;
  actor_id uuid := (payload->>'actorUserId')::uuid;
  operation_id uuid := (payload->>'operationId')::uuid;
  operation_action text := payload->>'action';
  bucket text := coalesce(payload->>'storageBucket', 'erp-attachments');
  company public.businesses%rowtype;
  operation public.company_data_operations%rowtype;
  tenant_table text;
  period_start date := date_trunc('month', statement_timestamp() at time zone 'Asia/Jakarta')::date;
begin
  perform app_private.apply_request_actor(actor_id);
  if operation_id is null or company_id is null or operation_action is null or operation_action not in ('reset', 'delete') then
    raise exception 'Permintaan penghapusan tidak valid.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('company-data:' || operation_id::text, 0));
  select * into operation from public.company_data_operations where id = operation_id;
  if found then
    if operation.business_id <> company_id or operation.actor_id <> actor_id or operation.action <> operation_action then
      raise exception 'Permintaan tidak dapat digunakan kembali.' using errcode = '42501';
    end if;
    return jsonb_build_object('bucket', operation.storage_bucket, 'paths', operation.storage_paths);
  end if;

  select * into company from public.businesses where id = company_id for update;
  if not found or not exists (
    select 1 from public.business_members where business_id = company_id and auth_user_id = actor_id and role = 'owner'
  ) or exists (select 1 from public.demo_sandboxes where business_id = company_id) then
    raise exception 'Operasi data hanya tersedia untuk pemilik perusahaan aktif.' using errcode = '42501';
  end if;

  insert into public.company_data_operations (id, business_id, actor_id, action, storage_bucket, storage_paths)
  select operation_id, company_id, actor_id, operation_action, bucket, coalesce(array_agg(object.name), '{}')
  from storage.objects as object
  where object.bucket_id = bucket and object.name like company_id::text || '/%'
    and (operation_action = 'delete' or object.name not like company_id::text || '/business-logo/%')
  returning * into operation;

  -- Remove periods first to let existing posting locks coordinate the reset.
  foreach tenant_table in array array[
    'report_periods', 'attachments', 'payment_allocations', 'payroll_runs', 'payments',
    'fixed_asset_depreciation_lines', 'fixed_asset_depreciation_runs', 'fixed_asset_disposals', 'fixed_assets',
    'stock_movements', 'stock_transfers', 'stock_adjustments', 'stock_opnames', 'branch_expenses',
    'sales_invoice_lines', 'sales_invoices', 'purchase_bill_lines', 'purchase_bills',
    'raw_payments', 'raw_transaction_lines', 'daily_transaction_summaries', 'raw_transactions',
    'settlement_records', 'raw_import_batches', 'import_batches',
    'production_order_lines', 'production_orders', 'mrp_recommendations', 'mrp_runs', 'demand_forecasts',
    'product_structure_lines', 'product_structures', 'inventory_items', 'products', 'customers', 'suppliers',
    'leave_requests', 'attendance', 'employees', 'transactions',
    'journal_lines', 'journal_entries', 'document_sequences', 'activity_events', 'audit_logs'
  ] loop
    execute format('delete from public.%I where business_id = $1', tenant_table) using company_id;
  end loop;

  if operation_action = 'delete' then
    delete from public.businesses where id = company_id;
  else
    insert into public.report_periods (business_id, label, start_date, end_date)
    values (company_id, to_char(period_start, 'YYYY-MM'), period_start, (period_start + interval '1 month - 1 day')::date);
    insert into public.customers (business_id, code, name)
    values (company_id, 'POS-UMUM', 'Pelanggan Umum');
    insert into public.activity_events (business_id, actor_user_id, actor_name, module, action, description)
    values (company_id, actor_id, company.owner_name, 'accounting', 'data_reset', 'Data operasional perusahaan direset.');
  end if;

  return jsonb_build_object('bucket', operation.storage_bucket, 'paths', operation.storage_paths);
end;
$$;

revoke all on function public.bootstrap_first_business(text, text, text, text, text, uuid),
  public.change_business_ownership(jsonb), public.clear_company_data(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.bootstrap_first_business(text, text, text, text, text, uuid),
  public.change_business_ownership(jsonb), public.clear_company_data(jsonb) to service_role;

commit;
