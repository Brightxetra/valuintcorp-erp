begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
begin
  if current_user <> 'postgres' then
    raise exception 'BPJS policy authorization migration must run as the postgres role.'
      using errcode = '42501';
  end if;
end;
$$;

drop policy if exists "hr and finance can read bpjs policies"
  on public.bpjs_policies;
drop policy if exists "hr can manage bpjs policies"
  on public.bpjs_policies;
drop policy if exists "authorized members can read bpjs policies"
  on public.bpjs_policies;
drop policy if exists "hr can insert bpjs policies"
  on public.bpjs_policies;
drop policy if exists "hr can update bpjs policies"
  on public.bpjs_policies;
drop policy if exists "hr can delete bpjs policies"
  on public.bpjs_policies;

create policy "payroll operators can read bpjs policies"
on public.bpjs_policies
for select
to authenticated
using (
  (select app_private.member_has_permission(business_id, 'payroll:run'))
);

revoke all privileges on table public.bpjs_policies
  from public, anon, authenticated;
grant select on table public.bpjs_policies to authenticated;

create or replace function app_private.upsert_bpjs_policy_internal(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  target_business_id uuid;
  target_effective_date date;
  target_gross_salary_multiplier numeric;
  target_health_employee_rate numeric;
  target_health_employer_rate numeric;
  target_health_salary_cap numeric;
  target_jht_employee_rate numeric;
  target_jht_employer_rate numeric;
  target_jht_salary_cap numeric;
  target_jpn_employee_rate numeric;
  target_jpn_employer_rate numeric;
  target_jpn_salary_cap numeric;
  target_jkk_employer_rate numeric;
  target_jkm_employer_rate numeric;
  saved_policy public.bpjs_policies%rowtype;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'A BPJS policy object is required.'
      using errcode = '22023';
  end if;

  target_business_id := nullif(payload->>'businessId', '')::uuid;
  target_effective_date := nullif(payload->>'effectiveDate', '')::date;
  target_gross_salary_multiplier := nullif(payload->>'grossSalaryMultiplier', '')::numeric;
  target_health_employee_rate := nullif(payload->>'healthEmployeeRate', '')::numeric;
  target_health_employer_rate := nullif(payload->>'healthEmployerRate', '')::numeric;
  target_health_salary_cap := nullif(payload->>'healthSalaryCap', '')::numeric;
  target_jht_employee_rate := nullif(payload->>'jhtEmployeeRate', '')::numeric;
  target_jht_employer_rate := nullif(payload->>'jhtEmployerRate', '')::numeric;
  target_jht_salary_cap := nullif(payload->>'jhtSalaryCap', '')::numeric;
  target_jpn_employee_rate := nullif(payload->>'jpnEmployeeRate', '')::numeric;
  target_jpn_employer_rate := nullif(payload->>'jpnEmployerRate', '')::numeric;
  target_jpn_salary_cap := nullif(payload->>'jpnSalaryCap', '')::numeric;
  target_jkk_employer_rate := nullif(payload->>'jkkEmployerRate', '')::numeric;
  target_jkm_employer_rate := nullif(payload->>'jkmEmployerRate', '')::numeric;

  if target_business_id is null
    or target_effective_date is null
    or target_gross_salary_multiplier is null
    or target_health_employee_rate is null
    or target_health_employer_rate is null
    or target_health_salary_cap is null
    or target_jht_employee_rate is null
    or target_jht_employer_rate is null
    or target_jht_salary_cap is null
    or target_jpn_employee_rate is null
    or target_jpn_employer_rate is null
    or target_jpn_salary_cap is null
    or target_jkk_employer_rate is null
    or target_jkm_employer_rate is null
  then
    raise exception 'All BPJS policy fields are required.'
      using errcode = '22023';
  end if;

  if target_gross_salary_multiplier < 0
    or target_gross_salary_multiplier > 5
    or target_health_employee_rate < 0
    or target_health_employee_rate > 1
    or target_health_employer_rate < 0
    or target_health_employer_rate > 1
    or target_jht_employee_rate < 0
    or target_jht_employee_rate > 1
    or target_jht_employer_rate < 0
    or target_jht_employer_rate > 1
    or target_jpn_employee_rate < 0
    or target_jpn_employee_rate > 1
    or target_jpn_employer_rate < 0
    or target_jpn_employer_rate > 1
    or target_jkk_employer_rate < 0
    or target_jkk_employer_rate > 1
    or target_jkm_employer_rate < 0
    or target_jkm_employer_rate > 1
    or target_health_salary_cap < 0
    or target_jht_salary_cap < 0
    or target_jpn_salary_cap < 0
  then
    raise exception 'BPJS policy values are outside the supported range.'
      using errcode = '22023';
  end if;

  if not app_private.member_has_permission(
    target_business_id,
    'hr:manage'
  ) then
    raise exception 'Effective HR management permission is required.'
      using errcode = '42501';
  end if;

  insert into public.bpjs_policies (
    business_id,
    effective_date,
    gross_salary_multiplier,
    health_employee_rate,
    health_employer_rate,
    health_salary_cap,
    jht_employee_rate,
    jht_employer_rate,
    jht_salary_cap,
    jpn_employee_rate,
    jpn_employer_rate,
    jpn_salary_cap,
    jkk_employer_rate,
    jkm_employer_rate
  ) values (
    target_business_id,
    target_effective_date,
    target_gross_salary_multiplier,
    target_health_employee_rate,
    target_health_employer_rate,
    target_health_salary_cap,
    target_jht_employee_rate,
    target_jht_employer_rate,
    target_jht_salary_cap,
    target_jpn_employee_rate,
    target_jpn_employer_rate,
    target_jpn_salary_cap,
    target_jkk_employer_rate,
    target_jkm_employer_rate
  )
  on conflict (business_id) do update set
    effective_date = excluded.effective_date,
    gross_salary_multiplier = excluded.gross_salary_multiplier,
    health_employee_rate = excluded.health_employee_rate,
    health_employer_rate = excluded.health_employer_rate,
    health_salary_cap = excluded.health_salary_cap,
    jht_employee_rate = excluded.jht_employee_rate,
    jht_employer_rate = excluded.jht_employer_rate,
    jht_salary_cap = excluded.jht_salary_cap,
    jpn_employee_rate = excluded.jpn_employee_rate,
    jpn_employer_rate = excluded.jpn_employer_rate,
    jpn_salary_cap = excluded.jpn_salary_cap,
    jkk_employer_rate = excluded.jkk_employer_rate,
    jkm_employer_rate = excluded.jkm_employer_rate
  returning * into saved_policy;

  insert into public.activity_events (
    business_id,
    actor_user_id,
    actor_name,
    module,
    action,
    description
  ) values (
    target_business_id,
    auth.uid(),
    coalesce(auth.uid()::text, 'System'),
    'hr',
    'updated BPJS policy',
    'BPJS contribution policy was updated.'
  );

  return to_jsonb(saved_policy);
end;
$$;

create or replace function public.upsert_bpjs_policy(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'A BPJS policy object is required.'
      using errcode = '22023';
  end if;

  perform app_private.apply_request_actor(
    nullif(payload->>'actorUserId', '')::uuid
  );

  return app_private.upsert_bpjs_policy_internal(payload - 'actorUserId');
end;
$$;

comment on function public.upsert_bpjs_policy(jsonb) is
  'Service-role-only BPJS policy command. Rebinds the signed-in actor and requires effective hr:manage permission.';

revoke all on function app_private.upsert_bpjs_policy_internal(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.upsert_bpjs_policy(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.upsert_bpjs_policy(jsonb) to service_role;

commit;
