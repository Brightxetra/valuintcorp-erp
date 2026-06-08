-- Production hotfix for deployed projects that missed migration 007.
-- Safe to run multiple times in Supabase SQL Editor.
-- It fixes: Could not find table 'public.member_invites' in schema cache.

create extension if not exists "pgcrypto";

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.member_invites (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  email text not null,
  role text not null check (role in ('owner', 'finance_admin', 'staff', 'hr', 'external_advisor', 'system_admin')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by uuid,
  accepted_by uuid,
  accepted_at timestamptz,
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists member_invites_pending_email_idx
  on public.member_invites (business_id, lower(email))
  where status = 'pending';

create index if not exists member_invites_business_status_idx
  on public.member_invites (business_id, status, created_at desc);

alter table public.member_invites enable row level security;

drop policy if exists "admins can read member invites" on public.member_invites;
create policy "admins can read member invites" on public.member_invites for select
using (public.has_business_role(business_id, array['owner', 'finance_admin', 'system_admin']));

drop policy if exists "admins can manage member invites" on public.member_invites;
create policy "admins can manage member invites" on public.member_invites for all
using (public.has_business_role(business_id, array['owner', 'finance_admin', 'system_admin']))
with check (public.has_business_role(business_id, array['owner', 'finance_admin', 'system_admin']));

drop trigger if exists touch_member_invites_updated_at on public.member_invites;
create trigger touch_member_invites_updated_at
before update on public.member_invites
for each row execute function public.touch_updated_at();

create or replace function public.accept_member_invite(target_business_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_record record;
  invite_email text := lower(coalesce(auth.jwt()->>'email', ''));
begin
  if auth.uid() is null or invite_email = '' then
    raise exception 'Authentication with email is required.';
  end if;

  select * into invite_record
  from public.member_invites
  where business_id = target_business_id
    and lower(email) = invite_email
    and status = 'pending'
    and expires_at > now()
  order by created_at desc
  limit 1;

  if invite_record.id is null then
    raise exception 'No active invite found for this user and business.';
  end if;

  insert into public.business_members (business_id, auth_user_id, role)
  values (target_business_id, auth.uid(), invite_record.role)
  on conflict (business_id, auth_user_id)
  do update set role = excluded.role;

  update public.member_invites
  set status = 'accepted', accepted_by = auth.uid(), accepted_at = now()
  where id = invite_record.id;

  insert into public.activity_events (business_id, actor_user_id, actor_name, module, action, description)
  values (
    target_business_id,
    auth.uid(),
    invite_email,
    'accounting',
    'member invite accepted',
    'A pending member invite was accepted.'
  );

  return invite_record.id;
end;
$$;

grant select, insert, update, delete on public.member_invites to authenticated;
grant execute on function public.accept_member_invite(uuid) to authenticated;

create table if not exists public.transaction_source_mappings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  transaction_source_id uuid not null references public.transaction_sources(id) on delete cascade,
  default_location_id uuid references public.locations(id),
  source_account_code text,
  tax_mode text not null default 'none' check (tax_mode in ('none', 'final_umkm', 'vat', 'withholding')),
  payment_method_mapping jsonb not null default '{}'::jsonb,
  product_mapping jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, transaction_source_id)
);

create index if not exists transaction_source_mappings_business_source_idx
  on public.transaction_source_mappings (business_id, transaction_source_id);

alter table public.transaction_source_mappings enable row level security;

drop policy if exists "members can read transaction source mappings" on public.transaction_source_mappings;
create policy "members can read transaction source mappings" on public.transaction_source_mappings for select
using (public.is_business_member(business_id));

drop policy if exists "finance can manage transaction source mappings" on public.transaction_source_mappings;
create policy "finance can manage transaction source mappings" on public.transaction_source_mappings for all
using (public.has_business_role(business_id, array['owner', 'finance_admin', 'system_admin']))
with check (public.has_business_role(business_id, array['owner', 'finance_admin', 'system_admin']));

drop trigger if exists touch_transaction_source_mappings_updated_at on public.transaction_source_mappings;
create trigger touch_transaction_source_mappings_updated_at
before update on public.transaction_source_mappings
for each row execute function public.touch_updated_at();

create or replace function public.ensure_transaction_source_mapping_business()
returns trigger
language plpgsql
as $$
declare
  source_business uuid;
  location_business uuid;
begin
  select business_id into source_business
  from public.transaction_sources
  where id = new.transaction_source_id;

  if source_business is null or source_business <> new.business_id then
    raise exception 'Transaction source mapping must belong to the same business as the source.';
  end if;

  if new.default_location_id is not null then
    select business_id into location_business
    from public.locations
    where id = new.default_location_id;

    if location_business is null or location_business <> new.business_id then
      raise exception 'Transaction source mapping location must belong to the same business.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists ensure_transaction_source_mapping_business_trigger on public.transaction_source_mappings;
create trigger ensure_transaction_source_mapping_business_trigger
before insert or update on public.transaction_source_mappings
for each row execute function public.ensure_transaction_source_mapping_business();

grant select, insert, update, delete on public.transaction_source_mappings to authenticated;

grant usage on schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

notify pgrst, 'reload schema';
