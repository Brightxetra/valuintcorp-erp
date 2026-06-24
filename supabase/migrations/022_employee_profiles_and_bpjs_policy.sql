-- Expand employee master data and make BPJS rates configurable per business.

alter table public.employees
  add column if not exists department text,
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists address text,
  add column if not exists tax_status text,
  add column if not exists npwp text,
  add column if not exists bank_name text,
  add column if not exists bank_account_no text,
  add column if not exists bank_account_name text,
  add column if not exists bpjs_health_no text,
  add column if not exists bpjs_employment_no text;

create table if not exists public.bpjs_policies (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  effective_date date not null default current_date,
  gross_salary_multiplier numeric(8, 4) not null default 1.1 check (gross_salary_multiplier >= 0),
  health_employee_rate numeric(8, 6) not null default 0.01 check (health_employee_rate >= 0),
  health_employer_rate numeric(8, 6) not null default 0.04 check (health_employer_rate >= 0),
  health_salary_cap numeric(18, 2) not null default 12000000 check (health_salary_cap >= 0),
  jht_employee_rate numeric(8, 6) not null default 0.037 check (jht_employee_rate >= 0),
  jht_employer_rate numeric(8, 6) not null default 0.037 check (jht_employer_rate >= 0),
  jht_salary_cap numeric(18, 2) not null default 1466800 check (jht_salary_cap >= 0),
  jpn_employee_rate numeric(8, 6) not null default 0.02 check (jpn_employee_rate >= 0),
  jpn_employer_rate numeric(8, 6) not null default 0.02 check (jpn_employer_rate >= 0),
  jpn_salary_cap numeric(18, 2) not null default 1466800 check (jpn_salary_cap >= 0),
  jkk_employer_rate numeric(8, 6) not null default 0.0054 check (jkk_employer_rate >= 0),
  jkm_employer_rate numeric(8, 6) not null default 0.003 check (jkm_employer_rate >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id)
);

drop trigger if exists touch_bpjs_policies_updated_at on public.bpjs_policies;
create trigger touch_bpjs_policies_updated_at
before update on public.bpjs_policies
for each row execute function public.touch_updated_at();

insert into public.bpjs_policies (business_id)
select id from public.businesses
on conflict (business_id) do nothing;

alter table public.bpjs_policies enable row level security;

drop policy if exists "hr and finance can read bpjs policies" on public.bpjs_policies;
create policy "hr and finance can read bpjs policies"
on public.bpjs_policies for select
using (app_private.has_business_role(business_id, array['owner', 'finance_admin', 'hr', 'system_admin']));

drop policy if exists "hr can manage bpjs policies" on public.bpjs_policies;
create policy "hr can manage bpjs policies"
on public.bpjs_policies for all
using (app_private.has_business_role(business_id, array['owner', 'hr', 'system_admin']))
with check (app_private.has_business_role(business_id, array['owner', 'hr', 'system_admin']));

grant select, insert, update, delete on public.bpjs_policies to authenticated, service_role;
