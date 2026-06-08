create extension if not exists "pgcrypto";

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  display_name text not null,
  industry text not null check (industry in ('service', 'retail', 'food_beverage', 'online_seller', 'manufacturing', 'general')),
  tax_id text,
  base_currency text not null default 'IDR',
  period_start_month int not null default 1 check (period_start_month between 1 and 12),
  owner_name text not null,
  created_at timestamptz not null default now()
);

create table public.business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  auth_user_id uuid not null,
  role text not null check (role in ('owner', 'finance_admin', 'staff', 'hr', 'external_advisor', 'system_admin')),
  created_at timestamptz not null default now(),
  unique (business_id, auth_user_id)
);

create table public.chart_of_accounts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  code text not null,
  name text not null,
  type text not null check (type in ('asset', 'liability', 'equity', 'revenue', 'expense')),
  normal_balance text not null check (normal_balance in ('debit', 'credit')),
  category text not null,
  is_system boolean not null default false,
  is_active boolean not null default true,
  unique (business_id, code)
);

create table public.report_periods (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  label text not null,
  start_date date not null,
  end_date date not null,
  locked boolean not null default false,
  locked_at timestamptz,
  locked_by uuid,
  check (start_date <= end_date),
  unique (business_id, start_date, end_date)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  type text not null check (type in ('sale', 'expense', 'inventory_purchase', 'payroll', 'adjustment')),
  date date not null,
  counterparty text,
  gross_amount numeric(18, 2) not null check (gross_amount >= 0),
  attachment_urls text[] not null default '{}',
  imported_from text check (imported_from in ('manual', 'csv', 'adapter')),
  created_at timestamptz not null default now()
);

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete set null,
  date date not null,
  period text not null,
  description text not null,
  source text not null check (source in ('opening_balance', 'manual_transaction', 'csv_import', 'inventory', 'payroll', 'tax', 'reversal')),
  status text not null default 'posted' check (status in ('draft', 'posted', 'reversed')),
  reference_id uuid,
  reversed_entry_id uuid references public.journal_entries(id),
  created_by uuid,
  created_by_role text not null,
  created_at timestamptz not null default now()
);

create table public.journal_lines (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  journal_entry_id uuid not null references public.journal_entries(id) on delete cascade,
  account_id uuid not null references public.chart_of_accounts(id),
  debit numeric(18, 2) not null default 0 check (debit >= 0),
  credit numeric(18, 2) not null default 0 check (credit >= 0),
  memo text,
  check ((debit > 0 and credit = 0) or (credit > 0 and debit = 0))
);

create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  code text not null,
  name text not null,
  location text,
  is_active boolean not null default true,
  unique (business_id, code)
);

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  sku text not null,
  name text not null,
  variant text,
  unit text not null,
  track_stock boolean not null default true,
  default_warehouse_id uuid references public.warehouses(id),
  unique (business_id, sku)
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  item_id uuid not null references public.inventory_items(id),
  warehouse_id uuid not null references public.warehouses(id),
  date date not null,
  type text not null check (type in ('purchase', 'sale', 'transfer_in', 'transfer_out', 'adjustment_in', 'adjustment_out')),
  quantity numeric(18, 4) not null check (quantity > 0),
  value numeric(18, 2) not null default 0 check (value >= 0),
  journal_entry_id uuid references public.journal_entries(id),
  memo text,
  created_at timestamptz not null default now()
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  employee_no text not null,
  name text not null,
  role text not null,
  contract_type text not null check (contract_type in ('permanent', 'contract', 'daily')),
  status text not null check (status in ('active', 'inactive', 'contract')),
  base_salary numeric(18, 2) not null default 0,
  daily_rate numeric(18, 2),
  joined_at date not null,
  unique (business_id, employee_no)
);

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  date date not null,
  status text not null check (status in ('present', 'absent', 'leave', 'sick')),
  hours numeric(6, 2) not null default 0,
  unique (business_id, employee_id, date)
);

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reason text not null,
  check (start_date <= end_date)
);

create table public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  period text not null,
  employee_id uuid not null references public.employees(id),
  gross_pay numeric(18, 2) not null check (gross_pay >= 0),
  deductions numeric(18, 2) not null default 0,
  tax_withheld numeric(18, 2) not null default 0,
  net_pay numeric(18, 2) not null check (net_pay >= 0),
  components jsonb not null default '[]',
  journal_entry_id uuid references public.journal_entries(id),
  created_at timestamptz not null default now()
);

create table public.tax_profiles (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses(id) on delete cascade,
  taxpayer_type text not null check (taxpayer_type in ('individual_umkm', 'corporate_umkm')),
  uses_final_umkm_rate boolean not null default true,
  final_umkm_rate numeric(8, 6) not null default 0.005,
  coretax_status text not null default 'not_started' check (coretax_status in ('not_started', 'account_ready', 'certificate_ready')),
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid,
  actor_user_id uuid,
  action text not null,
  table_name text not null,
  record_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.is_business_member(target_business_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.business_members member
    where member.business_id = target_business_id
      and member.auth_user_id = auth.uid()
  );
$$;

create or replace function public.is_period_locked(target_business_id uuid, target_date date)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.report_periods period
    where period.business_id = target_business_id
      and period.locked = true
      and target_date between period.start_date and period.end_date
  );
$$;

create or replace function public.prevent_locked_period_changes()
returns trigger
language plpgsql
as $$
declare
  target_business uuid;
  target_date date;
begin
  target_business := coalesce(new.business_id, old.business_id);
  target_date := coalesce(new.date, old.date);

  if public.is_period_locked(target_business, target_date) then
    raise exception 'Period is locked. Use a correction or reversal entry.';
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function public.ensure_journal_balanced()
returns trigger
language plpgsql
as $$
declare
  target_entry uuid;
  debit_total numeric(18, 2);
  credit_total numeric(18, 2);
begin
  target_entry := coalesce(new.journal_entry_id, old.journal_entry_id);

  select coalesce(sum(debit), 0), coalesce(sum(credit), 0)
  into debit_total, credit_total
  from public.journal_lines
  where journal_entry_id = target_entry;

  if debit_total <> credit_total then
    raise exception 'Journal entry % is not balanced: debit %, credit %', target_entry, debit_total, credit_total;
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function public.audit_row_change()
returns trigger
language plpgsql
as $$
declare
  target_business uuid;
  target_id uuid;
begin
  target_business := coalesce(new.business_id, old.business_id);
  target_id := coalesce(new.id, old.id);

  insert into public.audit_logs (
    business_id,
    actor_user_id,
    action,
    table_name,
    record_id,
    before_data,
    after_data
  )
  values (
    target_business,
    auth.uid(),
    tg_op,
    tg_table_name,
    target_id,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );

  return coalesce(new, old);
end;
$$;

create trigger prevent_locked_journal_entries
before insert or update or delete on public.journal_entries
for each row execute function public.prevent_locked_period_changes();

create trigger prevent_locked_transactions
before insert or update or delete on public.transactions
for each row execute function public.prevent_locked_period_changes();

create constraint trigger journal_lines_must_balance
after insert or update or delete on public.journal_lines
deferrable initially deferred
for each row execute function public.ensure_journal_balanced();

create trigger audit_journal_entries
after insert or update or delete on public.journal_entries
for each row execute function public.audit_row_change();

create trigger audit_journal_lines
after insert or update or delete on public.journal_lines
for each row execute function public.audit_row_change();

create trigger audit_stock_movements
after insert or update or delete on public.stock_movements
for each row execute function public.audit_row_change();

create trigger audit_payroll_runs
after insert or update or delete on public.payroll_runs
for each row execute function public.audit_row_change();

alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.chart_of_accounts enable row level security;
alter table public.report_periods enable row level security;
alter table public.transactions enable row level security;
alter table public.journal_entries enable row level security;
alter table public.journal_lines enable row level security;
alter table public.warehouses enable row level security;
alter table public.inventory_items enable row level security;
alter table public.stock_movements enable row level security;
alter table public.employees enable row level security;
alter table public.attendance enable row level security;
alter table public.leave_requests enable row level security;
alter table public.payroll_runs enable row level security;
alter table public.tax_profiles enable row level security;
alter table public.audit_logs enable row level security;

create policy "members read businesses"
on public.businesses for select
using (public.is_business_member(id));

create policy "members read business memberships"
on public.business_members for select
using (public.is_business_member(business_id));

create policy "members manage business scoped rows"
on public.chart_of_accounts for all
using (public.is_business_member(business_id))
with check (public.is_business_member(business_id));

create policy "members manage report periods"
on public.report_periods for all
using (public.is_business_member(business_id))
with check (public.is_business_member(business_id));

create policy "members manage transactions"
on public.transactions for all
using (public.is_business_member(business_id))
with check (public.is_business_member(business_id));

create policy "members manage journal entries"
on public.journal_entries for all
using (public.is_business_member(business_id))
with check (public.is_business_member(business_id));

create policy "members manage journal lines"
on public.journal_lines for all
using (public.is_business_member(business_id))
with check (public.is_business_member(business_id));

create policy "members manage warehouses"
on public.warehouses for all
using (public.is_business_member(business_id))
with check (public.is_business_member(business_id));

create policy "members manage inventory items"
on public.inventory_items for all
using (public.is_business_member(business_id))
with check (public.is_business_member(business_id));

create policy "members manage stock movements"
on public.stock_movements for all
using (public.is_business_member(business_id))
with check (public.is_business_member(business_id));

create policy "members manage employees"
on public.employees for all
using (public.is_business_member(business_id))
with check (public.is_business_member(business_id));

create policy "members manage attendance"
on public.attendance for all
using (public.is_business_member(business_id))
with check (public.is_business_member(business_id));

create policy "members manage leave requests"
on public.leave_requests for all
using (public.is_business_member(business_id))
with check (public.is_business_member(business_id));

create policy "members manage payroll runs"
on public.payroll_runs for all
using (public.is_business_member(business_id))
with check (public.is_business_member(business_id));

create policy "members manage tax profiles"
on public.tax_profiles for all
using (public.is_business_member(business_id))
with check (public.is_business_member(business_id));

create policy "members read audit logs"
on public.audit_logs for select
using (public.is_business_member(business_id));
