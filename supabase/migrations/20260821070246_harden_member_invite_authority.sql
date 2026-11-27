begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
begin
  if current_user <> 'postgres' then
    raise exception 'Member invite authority migration must run as the postgres role.'
      using errcode = '42501';
  end if;
end;
$$;

create or replace function app_private.business_role_rank(target_role text)
returns integer
language sql
immutable
security invoker
set search_path = pg_catalog
as $$
  select case target_role
    when 'owner' then 100
    when 'system_admin' then 90
    when 'finance_admin' then 70
    when 'hr' then 60
    when 'staff' then 50
    when 'external_advisor' then 40
    else 0
  end;
$$;

create or replace function app_private.business_role_permissions(target_role text)
returns text[]
language sql
immutable
security invoker
set search_path = pg_catalog
as $$
  select case target_role
    when 'owner' then array[
      'business:read', 'business:update', 'accounting:read', 'accounting:write',
      'reports:export', 'inventory:manage', 'hr:manage', 'payroll:run',
      'tax:prepare', 'admin:manage_users', 'pos:read', 'pos:sell', 'pos:expenses'
    ]::text[]
    when 'system_admin' then array[
      'business:read', 'business:update', 'accounting:read', 'accounting:write',
      'reports:export', 'inventory:manage', 'hr:manage', 'payroll:run',
      'tax:prepare', 'admin:manage_users', 'pos:read', 'pos:sell', 'pos:expenses'
    ]::text[]
    when 'finance_admin' then array[
      'business:read', 'accounting:read', 'accounting:write', 'reports:export',
      'inventory:manage', 'tax:prepare', 'pos:read'
    ]::text[]
    when 'staff' then array['business:read', 'accounting:write', 'inventory:manage']::text[]
    when 'hr' then array['business:read', 'hr:manage', 'payroll:run', 'reports:export']::text[]
    when 'external_advisor' then array[
      'business:read', 'accounting:read', 'reports:export', 'tax:prepare'
    ]::text[]
    else '{}'::text[]
  end;
$$;

create or replace function app_private.member_effective_permissions_for_actor(
  target_business_id uuid,
  actor_user_id uuid
)
returns text[]
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce((
    select case
      when member.role in ('owner', 'system_admin') then
        app_private.business_role_permissions(member.role)
      when member.access_scope = 'custom' then
        coalesce(member.access_permissions, '{}'::text[])
      else app_private.business_role_permissions(member.role)
    end
    from public.business_members member
    where member.business_id = target_business_id
      and member.auth_user_id = actor_user_id
    limit 1
  ), '{}'::text[]);
$$;

create or replace function app_private.member_has_permission_for_actor(
  target_business_id uuid,
  actor_user_id uuid,
  target_permission text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce(
    target_permission = any(
      app_private.member_effective_permissions_for_actor(target_business_id, actor_user_id)
    ),
    false
  );
$$;

create or replace function app_private.member_has_permission(
  target_business_id uuid,
  target_permission text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select app_private.member_has_permission_for_actor(
    target_business_id,
    auth.uid(),
    target_permission
  );
$$;

create or replace function app_private.member_invite_assignment_allowed_for_actor(
  target_business_id uuid,
  actor_user_id uuid,
  target_role text,
  target_access_scope text,
  target_access_permissions text[],
  target_location_ids uuid[]
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  actor_role text;
  actor_permissions text[];
  requested_permissions text[];
  known_permissions text[] := app_private.business_role_permissions('owner');
begin
  select member.role
  into actor_role
  from public.business_members member
  where member.business_id = target_business_id
    and member.auth_user_id = actor_user_id;

  if actor_role is null
    or target_role not in (
      'owner', 'system_admin', 'finance_admin', 'hr', 'staff', 'external_advisor'
    )
    or target_access_scope not in ('role', 'custom')
  then
    return false;
  end if;

  actor_permissions := app_private.member_effective_permissions_for_actor(
    target_business_id,
    actor_user_id
  );

  if not ('admin:manage_users' = any(actor_permissions)) then
    return false;
  end if;

  if app_private.business_role_rank(target_role)
      > app_private.business_role_rank(actor_role)
  then
    return false;
  end if;

  if target_role = 'owner' and actor_role <> 'owner' then
    return false;
  end if;

  if target_role in ('owner', 'system_admin') and target_access_scope <> 'role' then
    return false;
  end if;

  if target_access_scope = 'role' then
    if cardinality(coalesce(target_access_permissions, '{}'::text[])) <> 0 then
      return false;
    end if;

    requested_permissions := app_private.business_role_permissions(target_role);
  else
    requested_permissions := coalesce(target_access_permissions, '{}'::text[]);
  end if;

  if exists (
    select 1
    from unnest(requested_permissions) permission_name
    where not (permission_name = any(known_permissions))
  ) then
    return false;
  end if;

  if exists (
    select 1
    from unnest(requested_permissions) permission_name
    where not (permission_name = any(actor_permissions))
  ) then
    return false;
  end if;

  if target_access_scope = 'custom'
    and (
      'pos:read' = any(requested_permissions)
      or 'pos:sell' = any(requested_permissions)
      or 'pos:expenses' = any(requested_permissions)
    )
    and cardinality(coalesce(target_location_ids, '{}'::uuid[])) = 0
  then
    return false;
  end if;

  if exists (
    select 1
    from unnest(coalesce(target_location_ids, '{}'::uuid[])) requested_location_id
    where not exists (
      select 1
      from public.locations location
      where location.id = requested_location_id
        and location.business_id = target_business_id
        and location.is_active
        and location.type in ('branch', 'outlet', 'store')
    )
  ) then
    return false;
  end if;

  return true;
end;
$$;

create or replace function app_private.member_invite_assignment_allowed(
  target_business_id uuid,
  target_role text,
  target_access_scope text,
  target_access_permissions text[],
  target_location_ids uuid[]
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select app_private.member_invite_assignment_allowed_for_actor(
    target_business_id,
    auth.uid(),
    target_role,
    target_access_scope,
    target_access_permissions,
    target_location_ids
  );
$$;

create or replace function app_private.protect_member_invite_update()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  trusted_acceptance_id text := nullif(
    current_setting('app.member_invite_acceptance_id', true),
    ''
  );
  trusted_target_user_id text := nullif(
    current_setting('app.member_invite_target_user_id', true),
    ''
  );
begin
  if new.business_id is distinct from old.business_id
    or new.email is distinct from old.email
    or new.role is distinct from old.role
    or new.invited_by is distinct from old.invited_by
    or new.access_scope is distinct from old.access_scope
    or new.access_permissions is distinct from old.access_permissions
    or new.location_ids is distinct from old.location_ids
  then
    raise exception 'Member invite assignment fields are immutable.'
      using errcode = '42501';
  end if;

  if old.status <> 'pending' then
    raise exception 'Only pending member invites can be changed.'
      using errcode = '55000';
  end if;

  if new.status = 'accepted' then
    if current_user <> 'postgres'
      or trusted_acceptance_id is distinct from new.id::text
      or trusted_target_user_id is distinct from new.accepted_by::text
      or new.accepted_by is null
      or new.accepted_at is null
    then
      raise exception 'Member invites can only be accepted by the validated invite command.'
        using errcode = '42501';
    end if;
  elsif new.accepted_by is distinct from old.accepted_by
    or new.accepted_at is distinct from old.accepted_at
  then
    raise exception 'Invite acceptance fields are command-owned.'
      using errcode = '42501';
  end if;

  if new.status = 'pending'
    and (
      new.expires_at <= statement_timestamp()
      or new.expires_at > statement_timestamp() + interval '15 days'
    )
  then
    raise exception 'Pending member invites must expire within 15 days.'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_member_invite_update on public.member_invites;
create trigger protect_member_invite_update
before update on public.member_invites
for each row execute function app_private.protect_member_invite_update();

drop policy if exists "admins can read member invites" on public.member_invites;
create policy "authorized admins can read member invites"
on public.member_invites
for select
to authenticated
using (
  (select app_private.member_has_permission(business_id, 'admin:manage_users'))
);

drop policy if exists "admins can manage member invites insert" on public.member_invites;
drop policy if exists "admins can manage member invites update" on public.member_invites;
drop policy if exists "admins can manage member invites delete" on public.member_invites;
drop policy if exists "admins can manage member invites" on public.member_invites;

create policy "authorized admins can create bounded member invites"
on public.member_invites
for insert
to authenticated
with check (
  (select app_private.member_has_permission(business_id, 'admin:manage_users'))
  and (select app_private.member_invite_assignment_allowed(
    business_id,
    role,
    access_scope,
    access_permissions,
    location_ids
  ))
  and invited_by = (select auth.uid())
  and email = lower(btrim(email))
  and char_length(email) between 3 and 320
  and status = 'pending'
  and accepted_by is null
  and accepted_at is null
  and expires_at > statement_timestamp()
  and expires_at <= statement_timestamp() + interval '15 days'
);

create policy "authorized admins can update bounded member invites"
on public.member_invites
for update
to authenticated
using (
  (select app_private.member_has_permission(business_id, 'admin:manage_users'))
)
with check (
  (select app_private.member_has_permission(business_id, 'admin:manage_users'))
  and (select app_private.member_invite_assignment_allowed(
    business_id,
    role,
    access_scope,
    access_permissions,
    location_ids
  ))
);

create or replace function public.accept_pending_member_invites_for_user(payload jsonb)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  jwt_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
      ''
    )
  );
  target_user_id uuid := nullif(payload->>'targetUserId', '')::uuid;
  target_email text := lower(btrim(coalesce(payload->>'targetEmail', '')));
  candidate record;
  invite_record record;
  accepted_count integer := 0;
begin
  if jwt_role is distinct from 'service_role' then
    raise exception 'service_role is required for member invite acceptance.'
      using errcode = '42501';
  end if;

  if target_user_id is null or target_email = '' or char_length(target_email) > 320 then
    raise exception 'A target user and normalized email are required.'
      using errcode = '22023';
  end if;

  for candidate in
    select invite.id
    from public.member_invites invite
    where lower(invite.email) = target_email
      and invite.status = 'pending'
      and invite.expires_at > statement_timestamp()
    order by invite.business_id, invite.id
  loop
    select invite.*
    into invite_record
    from public.member_invites invite
    where invite.id = candidate.id
      and lower(invite.email) = target_email
      and invite.status = 'pending'
      and invite.expires_at > statement_timestamp()
    for update;

    if invite_record.id is null then
      continue;
    end if;

    if invite_record.invited_by is null
      or invite_record.invited_by = target_user_id
    then
      raise exception 'The member invite has no independent authorized inviter.'
        using errcode = '42501';
    end if;

    perform 1
    from public.business_members inviter
    where inviter.business_id = invite_record.business_id
      and inviter.auth_user_id = invite_record.invited_by
    for key share;

    if not found
      or not app_private.member_has_permission_for_actor(
        invite_record.business_id,
        invite_record.invited_by,
        'admin:manage_users'
      )
      or not app_private.member_invite_assignment_allowed_for_actor(
        invite_record.business_id,
        invite_record.invited_by,
        invite_record.role,
        invite_record.access_scope,
        invite_record.access_permissions,
        invite_record.location_ids
      )
    then
      raise exception 'The member invite authority is no longer valid.'
        using errcode = '42501';
    end if;

    perform set_config('app.member_invite_acceptance_id', invite_record.id::text, true);
    perform set_config('app.member_invite_target_user_id', target_user_id::text, true);

    insert into public.business_members (
      business_id,
      auth_user_id,
      role,
      access_scope,
      access_permissions,
      location_ids
    ) values (
      invite_record.business_id,
      target_user_id,
      invite_record.role,
      invite_record.access_scope,
      invite_record.access_permissions,
      invite_record.location_ids
    )
    on conflict (business_id, auth_user_id) do update set
      role = excluded.role,
      access_scope = excluded.access_scope,
      access_permissions = excluded.access_permissions,
      location_ids = excluded.location_ids;

    update public.member_invites invite
    set
      status = 'accepted',
      accepted_by = target_user_id,
      accepted_at = statement_timestamp()
    where invite.id = invite_record.id
      and invite.status = 'pending';

    if not found then
      raise exception 'The member invite changed during acceptance.'
        using errcode = '40001';
    end if;

    accepted_count := accepted_count + 1;
  end loop;

  return accepted_count;
end;
$$;

revoke all on function app_private.business_role_rank(text)
  from public, anon, authenticated, service_role;
revoke all on function app_private.business_role_permissions(text)
  from public, anon, authenticated, service_role;
revoke all on function app_private.member_effective_permissions_for_actor(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.member_has_permission_for_actor(uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function app_private.member_invite_assignment_allowed_for_actor(uuid, uuid, text, text, text[], uuid[])
  from public, anon, authenticated, service_role;
revoke all on function app_private.protect_member_invite_update()
  from public, anon, authenticated, service_role;

revoke all on function app_private.member_has_permission(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function app_private.member_invite_assignment_allowed(uuid, text, text, text[], uuid[])
  from public, anon, authenticated, service_role;
grant execute on function app_private.member_has_permission(uuid, text)
  to authenticated, service_role;
grant execute on function app_private.member_invite_assignment_allowed(uuid, text, text, text[], uuid[])
  to authenticated, service_role;

revoke all on function public.accept_member_invite(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.accept_pending_member_invites_for_user(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.accept_pending_member_invites_for_user(jsonb)
  to service_role;

revoke delete, truncate, references, trigger
on table public.member_invites
from authenticated;

commit;
