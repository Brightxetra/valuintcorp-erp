alter table public.employees
  add column if not exists compensation_components jsonb not null default '[]'::jsonb;

alter table public.employees
  drop constraint if exists employees_compensation_components_array_check;

alter table public.employees
  add constraint employees_compensation_components_array_check
  check (jsonb_typeof(compensation_components) = 'array');

alter table public.attachments
  drop constraint if exists attachments_owner_type_check;

alter table public.attachments
  add constraint attachments_owner_type_check
  check (owner_type in ('sales_invoice', 'purchase_bill', 'payment', 'payroll_run', 'fixed_asset', 'employee'));

alter policy "authorized members can read attachments" on public.attachments
using (
  (select app_private.member_can_read_attachment(business_id, owner_type, owner_id))
  or (owner_type = 'employee' and (select app_private.member_has_permission(business_id, 'hr:manage')))
);

create or replace function public.ensure_attachment_owner_business()
returns trigger
language plpgsql
as $$
declare
  owner_exists boolean;
begin
  if new.owner_type = 'sales_invoice' then
    select exists(select 1 from public.sales_invoices where id = new.owner_id and business_id = new.business_id) into owner_exists;
  elsif new.owner_type = 'purchase_bill' then
    select exists(select 1 from public.purchase_bills where id = new.owner_id and business_id = new.business_id) into owner_exists;
  elsif new.owner_type = 'payment' then
    select exists(select 1 from public.payments where id = new.owner_id and business_id = new.business_id) into owner_exists;
  elsif new.owner_type = 'payroll_run' then
    select exists(select 1 from public.payroll_runs where id = new.owner_id and business_id = new.business_id) into owner_exists;
  elsif new.owner_type = 'fixed_asset' then
    select exists(select 1 from public.fixed_assets where id = new.owner_id and business_id = new.business_id) into owner_exists;
  elsif new.owner_type = 'employee' then
    select exists(select 1 from public.employees where id = new.owner_id and business_id = new.business_id) into owner_exists;
  else
    owner_exists := false;
  end if;

  if not owner_exists then
    raise exception 'Attachment owner must exist in the same business.';
  end if;

  return new;
end;
$$;
