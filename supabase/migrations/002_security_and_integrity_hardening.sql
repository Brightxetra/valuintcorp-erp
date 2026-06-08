create or replace function public.member_role(target_business_id uuid)
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

create or replace function public.has_business_role(target_business_id uuid, allowed_roles text[])
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(public.member_role(target_business_id) = any(allowed_roles), false);
$$;

create or replace function public.create_business_with_owner(
  legal_name text,
  display_name text,
  industry text,
  owner_name text,
  tax_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_business_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  insert into public.businesses (legal_name, display_name, industry, owner_name, tax_id)
  values (legal_name, display_name, industry, owner_name, tax_id)
  returning id into new_business_id;

  insert into public.business_members (business_id, auth_user_id, role)
  values (new_business_id, auth.uid(), 'owner');

  return new_business_id;
end;
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

  if target_date is not null and public.is_period_locked(target_business, target_date) then
    raise exception 'Period is locked. Use a correction or reversal entry.';
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
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

create or replace function public.ensure_journal_entry_complete()
returns trigger
language plpgsql
as $$
declare
  debit_total numeric(18, 2);
  credit_total numeric(18, 2);
  line_count int;
begin
  if new.status = 'posted' then
    select count(*), coalesce(sum(debit), 0), coalesce(sum(credit), 0)
    into line_count, debit_total, credit_total
    from public.journal_lines
    where journal_entry_id = new.id;

    if line_count < 2 then
      raise exception 'Posted journal entry % requires at least two lines.', new.id;
    end if;

    if debit_total <> credit_total then
      raise exception 'Journal entry % is not balanced: debit %, credit %', new.id, debit_total, credit_total;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.ensure_journal_line_consistency()
returns trigger
language plpgsql
as $$
declare
  entry_business uuid;
  entry_date date;
  account_business uuid;
begin
  select business_id, date into entry_business, entry_date
  from public.journal_entries
  where id = coalesce(new.journal_entry_id, old.journal_entry_id);

  if entry_business is null then
    raise exception 'Journal entry does not exist.';
  end if;

  select business_id into account_business
  from public.chart_of_accounts
  where id = coalesce(new.account_id, old.account_id);

  if tg_op <> 'DELETE' then
    if new.business_id <> entry_business then
      raise exception 'Journal line business_id must match journal entry business_id.';
    end if;

    if account_business <> entry_business then
      raise exception 'Journal line account must belong to the same business.';
    end if;
  end if;

  if public.is_period_locked(entry_business, entry_date) then
    raise exception 'Period is locked. Use a correction or reversal entry.';
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function public.ensure_stock_movement_consistency()
returns trigger
language plpgsql
as $$
declare
  item_business uuid;
  warehouse_business uuid;
begin
  select business_id into item_business from public.inventory_items where id = new.item_id;
  select business_id into warehouse_business from public.warehouses where id = new.warehouse_id;

  if item_business <> new.business_id or warehouse_business <> new.business_id then
    raise exception 'Stock movement item and warehouse must belong to the same business.';
  end if;

  if public.is_period_locked(new.business_id, new.date) then
    raise exception 'Period is locked. Use a correction or reversal entry.';
  end if;

  return new;
end;
$$;

create or replace function public.ensure_payroll_run_consistency()
returns trigger
language plpgsql
as $$
declare
  employee_business uuid;
begin
  select business_id into employee_business from public.employees where id = new.employee_id;

  if employee_business <> new.business_id then
    raise exception 'Payroll employee must belong to the same business.';
  end if;

  if new.net_pay + new.deductions + new.tax_withheld <> new.gross_pay then
    raise exception 'Payroll credits must reconcile to gross pay.';
  end if;

  return new;
end;
$$;

drop trigger if exists journal_entry_must_be_complete on public.journal_entries;
create constraint trigger journal_entry_must_be_complete
after insert or update on public.journal_entries
deferrable initially deferred
for each row execute function public.ensure_journal_entry_complete();

drop trigger if exists ensure_journal_line_consistency on public.journal_lines;
create trigger ensure_journal_line_consistency
before insert or update or delete on public.journal_lines
for each row execute function public.ensure_journal_line_consistency();

drop trigger if exists prevent_locked_stock_movements on public.stock_movements;
create trigger prevent_locked_stock_movements
before insert or update on public.stock_movements
for each row execute function public.ensure_stock_movement_consistency();

drop trigger if exists ensure_payroll_run_consistency on public.payroll_runs;
create trigger ensure_payroll_run_consistency
before insert or update on public.payroll_runs
for each row execute function public.ensure_payroll_run_consistency();

drop policy if exists "members read businesses" on public.businesses;
drop policy if exists "members read business memberships" on public.business_members;
drop policy if exists "members manage business scoped rows" on public.chart_of_accounts;
drop policy if exists "members manage report periods" on public.report_periods;
drop policy if exists "members manage transactions" on public.transactions;
drop policy if exists "members manage journal entries" on public.journal_entries;
drop policy if exists "members manage journal lines" on public.journal_lines;
drop policy if exists "members manage warehouses" on public.warehouses;
drop policy if exists "members manage inventory items" on public.inventory_items;
drop policy if exists "members manage stock movements" on public.stock_movements;
drop policy if exists "members manage employees" on public.employees;
drop policy if exists "members manage attendance" on public.attendance;
drop policy if exists "members manage leave requests" on public.leave_requests;
drop policy if exists "members manage payroll runs" on public.payroll_runs;
drop policy if exists "members manage tax profiles" on public.tax_profiles;
drop policy if exists "members read audit logs" on public.audit_logs;

create policy "members can read businesses"
on public.businesses for select
using (public.is_business_member(id));

create policy "owners can update businesses"
on public.businesses for update
using (public.has_business_role(id, array['owner', 'system_admin']))
with check (public.has_business_role(id, array['owner', 'system_admin']));

create policy "members can read memberships"
on public.business_members for select
using (public.is_business_member(business_id));

create policy "owners can manage memberships"
on public.business_members for all
using (public.has_business_role(business_id, array['owner', 'system_admin']))
with check (public.has_business_role(business_id, array['owner', 'system_admin']));

create policy "members can read chart of accounts"
on public.chart_of_accounts for select
using (public.is_business_member(business_id));

create policy "finance can manage chart of accounts"
on public.chart_of_accounts for all
using (public.has_business_role(business_id, array['owner', 'finance_admin', 'system_admin']))
with check (public.has_business_role(business_id, array['owner', 'finance_admin', 'system_admin']));

create policy "members can read report periods"
on public.report_periods for select
using (public.is_business_member(business_id));

create policy "finance can manage report periods"
on public.report_periods for all
using (public.has_business_role(business_id, array['owner', 'finance_admin', 'system_admin']))
with check (public.has_business_role(business_id, array['owner', 'finance_admin', 'system_admin']));

create policy "members can read transactions"
on public.transactions for select
using (public.is_business_member(business_id));

create policy "accounting roles can manage transactions"
on public.transactions for all
using (public.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'system_admin']))
with check (public.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'system_admin']));

create policy "members can read journal entries"
on public.journal_entries for select
using (public.is_business_member(business_id));

create policy "finance can manage journal entries"
on public.journal_entries for all
using (public.has_business_role(business_id, array['owner', 'finance_admin', 'system_admin']))
with check (public.has_business_role(business_id, array['owner', 'finance_admin', 'system_admin']));

create policy "members can read journal lines"
on public.journal_lines for select
using (public.is_business_member(business_id));

create policy "finance can manage journal lines"
on public.journal_lines for all
using (public.has_business_role(business_id, array['owner', 'finance_admin', 'system_admin']))
with check (public.has_business_role(business_id, array['owner', 'finance_admin', 'system_admin']));

create policy "members can read inventory setup"
on public.warehouses for select
using (public.is_business_member(business_id));

create policy "inventory roles can manage warehouses"
on public.warehouses for all
using (public.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'system_admin']))
with check (public.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'system_admin']));

create policy "members can read inventory items"
on public.inventory_items for select
using (public.is_business_member(business_id));

create policy "inventory roles can manage items"
on public.inventory_items for all
using (public.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'system_admin']))
with check (public.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'system_admin']));

create policy "members can read stock movements"
on public.stock_movements for select
using (public.is_business_member(business_id));

create policy "inventory roles can manage stock movements"
on public.stock_movements for all
using (public.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'system_admin']))
with check (public.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'system_admin']));

create policy "hr and finance can read employees"
on public.employees for select
using (public.has_business_role(business_id, array['owner', 'finance_admin', 'hr', 'system_admin']));

create policy "hr can manage employees"
on public.employees for all
using (public.has_business_role(business_id, array['owner', 'hr', 'system_admin']))
with check (public.has_business_role(business_id, array['owner', 'hr', 'system_admin']));

create policy "hr can manage attendance"
on public.attendance for all
using (public.has_business_role(business_id, array['owner', 'hr', 'system_admin']))
with check (public.has_business_role(business_id, array['owner', 'hr', 'system_admin']));

create policy "hr can manage leave requests"
on public.leave_requests for all
using (public.has_business_role(business_id, array['owner', 'hr', 'system_admin']))
with check (public.has_business_role(business_id, array['owner', 'hr', 'system_admin']));

create policy "hr and finance can read payroll"
on public.payroll_runs for select
using (public.has_business_role(business_id, array['owner', 'finance_admin', 'hr', 'system_admin']));

create policy "hr can manage payroll"
on public.payroll_runs for all
using (public.has_business_role(business_id, array['owner', 'hr', 'system_admin']))
with check (public.has_business_role(business_id, array['owner', 'hr', 'system_admin']));

create policy "finance can read tax profiles"
on public.tax_profiles for select
using (public.has_business_role(business_id, array['owner', 'finance_admin', 'external_advisor', 'system_admin']));

create policy "finance can manage tax profiles"
on public.tax_profiles for all
using (public.has_business_role(business_id, array['owner', 'finance_admin', 'system_admin']))
with check (public.has_business_role(business_id, array['owner', 'finance_admin', 'system_admin']));

create policy "finance and advisors can read audit logs"
on public.audit_logs for select
using (public.has_business_role(business_id, array['owner', 'finance_admin', 'external_advisor', 'system_admin']));
