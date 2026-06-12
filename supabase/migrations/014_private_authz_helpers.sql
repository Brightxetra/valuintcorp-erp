-- Move authorization helper functions out of the exposed public API schema.
-- Workflow RPCs remain callable by authenticated users for now; Next.js API
-- routes validate session, business membership, and role before calling them.

create schema if not exists app_private;

revoke all on schema app_private from public;
grant usage on schema app_private to authenticated, service_role;

create or replace function app_private.member_role(target_business_id uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select member.role
  from public.business_members member
  where member.business_id = target_business_id
    and member.auth_user_id = auth.uid()
  limit 1;
$$;

create or replace function app_private.is_business_member(target_business_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.business_members member
    where member.business_id = target_business_id
      and member.auth_user_id = auth.uid()
  );
$$;

create or replace function app_private.has_business_role(target_business_id uuid, allowed_roles text[])
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(app_private.member_role(target_business_id) = any(allowed_roles), false);
$$;

revoke execute on function app_private.member_role(uuid) from public, anon;
revoke execute on function app_private.is_business_member(uuid) from public, anon;
revoke execute on function app_private.has_business_role(uuid, text[]) from public, anon;

grant execute on function app_private.member_role(uuid) to authenticated, service_role;
grant execute on function app_private.is_business_member(uuid) to authenticated, service_role;
grant execute on function app_private.has_business_role(uuid, text[]) to authenticated, service_role;

create or replace function public.member_role(target_business_id uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select app_private.member_role(target_business_id);
$$;

create or replace function public.is_business_member(target_business_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select app_private.is_business_member(target_business_id);
$$;

create or replace function public.has_business_role(target_business_id uuid, allowed_roles text[])
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select app_private.has_business_role(target_business_id, allowed_roles);
$$;

revoke execute on function public.member_role(uuid) from public, anon, authenticated;
revoke execute on function public.is_business_member(uuid) from public, anon, authenticated;
revoke execute on function public.has_business_role(uuid, text[]) from public, anon, authenticated;
grant execute on function public.member_role(uuid) to service_role;
grant execute on function public.is_business_member(uuid) to service_role;
grant execute on function public.has_business_role(uuid, text[]) to service_role;

create or replace function public.require_posting_role(target_business_id uuid, allowed_roles text[])
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  role text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  role := app_private.member_role(target_business_id);

  if role is null or not (role = any(allowed_roles)) then
    raise exception 'User is not allowed to post this document.';
  end if;

  return role;
end;
$$;

do $$
declare
  policy_record record;
  new_using text;
  new_check text;
  alter_sql text;
begin
  for policy_record in
    select
      policy_namespace.nspname as schema_name,
      policy_table.relname as table_name,
      policy.polname as policy_name,
      pg_get_expr(policy.polqual, policy.polrelid) as using_expr,
      pg_get_expr(policy.polwithcheck, policy.polrelid) as check_expr
    from pg_policy policy
    join pg_class policy_table on policy_table.oid = policy.polrelid
    join pg_namespace policy_namespace on policy_namespace.oid = policy_table.relnamespace
    where (
      coalesce(pg_get_expr(policy.polqual, policy.polrelid), '')
      || ' '
      || coalesce(pg_get_expr(policy.polwithcheck, policy.polrelid), '')
    ) ~ '(public\.)?(is_business_member|has_business_role|member_role)\s*\('
  loop
    new_using := policy_record.using_expr;
    new_check := policy_record.check_expr;

    if new_using is not null then
      new_using := replace(new_using, 'public.is_business_member', 'app_private.is_business_member');
      new_using := replace(new_using, 'public.has_business_role', 'app_private.has_business_role');
      new_using := replace(new_using, 'public.member_role', 'app_private.member_role');
      new_using := regexp_replace(new_using, '(^|[^.[:alnum:]_])is_business_member\s*\(', '\1app_private.is_business_member(', 'g');
      new_using := regexp_replace(new_using, '(^|[^.[:alnum:]_])has_business_role\s*\(', '\1app_private.has_business_role(', 'g');
      new_using := regexp_replace(new_using, '(^|[^.[:alnum:]_])member_role\s*\(', '\1app_private.member_role(', 'g');
    end if;

    if new_check is not null then
      new_check := replace(new_check, 'public.is_business_member', 'app_private.is_business_member');
      new_check := replace(new_check, 'public.has_business_role', 'app_private.has_business_role');
      new_check := replace(new_check, 'public.member_role', 'app_private.member_role');
      new_check := regexp_replace(new_check, '(^|[^.[:alnum:]_])is_business_member\s*\(', '\1app_private.is_business_member(', 'g');
      new_check := regexp_replace(new_check, '(^|[^.[:alnum:]_])has_business_role\s*\(', '\1app_private.has_business_role(', 'g');
      new_check := regexp_replace(new_check, '(^|[^.[:alnum:]_])member_role\s*\(', '\1app_private.member_role(', 'g');
    end if;

    alter_sql := format(
      'alter policy %I on %I.%I',
      policy_record.policy_name,
      policy_record.schema_name,
      policy_record.table_name
    );

    if new_using is not null then
      alter_sql := alter_sql || format(' using (%s)', new_using);
    end if;

    if new_check is not null then
      alter_sql := alter_sql || format(' with check (%s)', new_check);
    end if;

    execute alter_sql;
  end loop;
end;
$$;

revoke execute on function public.accept_member_invite(uuid) from public, anon, authenticated;
grant execute on function public.accept_member_invite(uuid) to service_role;
