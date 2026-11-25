begin;

create or replace function public.create_business_with_owner_for_actor(
  legal_name text,
  display_name text,
  industry text,
  owner_name text,
  tax_id text default null,
  actor_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  created_business_id uuid;
  canonical_industry text;
begin
  perform app_private.apply_request_actor(actor_user_id);
  canonical_industry := case
    when industry in ('umkm', 'food_beverage', 'online_seller') then 'umkm'
    when industry in ('general', 'retail', 'service', 'manufacturing') then 'general'
  end;
  if canonical_industry is null then
    raise exception 'Template perusahaan tidak valid.' using errcode = '22023';
  end if;
  created_business_id := public.create_business_with_owner(legal_name, display_name, canonical_industry, owner_name, tax_id);
  perform public.apply_industry_template_internal(jsonb_build_object(
    'businessId', created_business_id, 'templateId', canonical_industry
  ));
  return created_business_id;
end;
$$;

create function public.company_report_summary(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  context_business_id uuid := (payload->>'businessId')::uuid;
  start_date date := (payload->>'startDate')::date;
  end_date date := (payload->>'endDate')::date;
  company_ids uuid[];
  company_id uuid;
  reporting_currency text;
  report jsonb;
begin
  perform app_private.apply_request_actor((payload->>'actorUserId')::uuid);

  if not app_private.member_has_permission(context_business_id, 'reports:export')
    or not app_private.member_has_permission(context_business_id, 'accounting:read')
    or not exists (
      select 1 from public.businesses as business
      where business.id = context_business_id
        and business.industry in ('general', 'manufacturing', 'retail', 'service')
    ) then
    raise exception 'Akses laporan General diperlukan.' using errcode = '42501';
  end if;

  if start_date is null or end_date is null or start_date > end_date
    or jsonb_typeof(payload->'companyIds') is distinct from 'array' then
    raise exception 'Pilih perusahaan dan rentang tanggal yang valid.' using errcode = '22023';
  end if;
  select array_agg(distinct requested.id::uuid) into company_ids
  from jsonb_array_elements_text(payload->'companyIds') as requested(id);
  if coalesce(cardinality(company_ids), 0) not between 2 and 25 or array_position(company_ids, null) is not null then
    raise exception 'Pilih 2 sampai 25 perusahaan.' using errcode = '22023';
  end if;

  foreach company_id in array company_ids loop
    if not app_private.member_has_permission(company_id, 'reports:export')
      or not app_private.member_has_permission(company_id, 'accounting:read') then
      raise exception 'Akses laporan diperlukan pada setiap perusahaan yang dipilih.' using errcode = '42501';
    end if;
  end loop;

  select min(business.base_currency) into reporting_currency
  from public.businesses as business
  where business.id = any(company_ids)
  having count(distinct business.base_currency) = 1;
  if reporting_currency is distinct from 'IDR' then
    raise exception 'Ringkasan gabungan memerlukan mata uang IDR pada semua perusahaan.' using errcode = '22023';
  end if;

  with balances as (
    select entry.business_id,
      sum(line.credit - line.debit) filter (where account.type = 'revenue' and entry.date >= start_date) as revenue,
      sum(line.debit - line.credit) filter (where account.type = 'expense' and entry.date >= start_date) as expenses,
      sum(line.debit - line.credit) filter (where account.type = 'asset') as assets,
      sum(line.credit - line.debit) filter (where account.type = 'liability') as liabilities,
      sum(line.credit - line.debit) filter (where account.type in ('equity', 'revenue', 'expense')) as equity
    from public.journal_entries as entry
    join public.journal_lines as line on line.business_id = entry.business_id and line.journal_entry_id = entry.id
    join public.chart_of_accounts as account on account.business_id = entry.business_id and account.id = line.account_id
    where entry.business_id = any(company_ids) and entry.status = 'posted' and entry.date <= end_date
    group by entry.business_id
  )
  select jsonb_agg(jsonb_build_object(
    'id', business.id,
    'name', business.display_name,
    'revenue', coalesce(balances.revenue, 0),
    'expenses', coalesce(balances.expenses, 0),
    'assets', coalesce(balances.assets, 0),
    'liabilities', coalesce(balances.liabilities, 0),
    'equity', coalesce(balances.equity, 0)
  ) order by business.display_name, business.id)
  into report
  from public.businesses as business
  left join balances on balances.business_id = business.id
  where business.id = any(company_ids);

  return jsonb_build_object('startDate', start_date, 'endDate', end_date, 'companies', report);
end;
$$;

revoke all on function public.company_report_summary(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.company_report_summary(jsonb) to service_role;

commit;
