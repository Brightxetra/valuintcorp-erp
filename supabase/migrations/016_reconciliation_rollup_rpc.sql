-- Aggregate reconciliation inputs in PostgreSQL so the API does not pull raw
-- transaction detail into the Next.js runtime for large tenants.

create or replace function public.reconciliation_rollup(
  target_business_id uuid,
  target_location_id uuid default null,
  target_source text default null,
  target_date_from date default null,
  target_date_to date default null,
  result_limit integer default 500
)
returns table (
  summary_id uuid,
  business_id uuid,
  location_id uuid,
  source text,
  date date,
  status text,
  raw_total numeric,
  summary_total numeric,
  settlement_total numeric,
  journal_total numeric,
  raw_delta numeric,
  settlement_delta numeric,
  journal_delta numeric
)
language sql
stable
set search_path = public
as $$
  with scoped_summaries as (
    select
      summary.id,
      summary.business_id,
      summary.location_id,
      summary.source,
      summary.date,
      summary.status,
      summary.net_amount
    from public.daily_transaction_summaries summary
    where summary.business_id = target_business_id
      and (target_location_id is null or summary.location_id = target_location_id)
      and (target_source is null or summary.source = target_source)
      and (target_date_from is null or summary.date >= target_date_from)
      and (target_date_to is null or summary.date <= target_date_to)
    order by summary.date desc, summary.created_at desc
    limit least(greatest(coalesce(result_limit, 500), 1), 500)
  ),
  raw_totals as (
    select
      raw.business_id,
      raw.location_id,
      raw.source,
      raw.transaction_date as date,
      coalesce(sum(raw.net_amount), 0) as raw_total
    from public.raw_transactions raw
    join scoped_summaries summary
      on summary.business_id = raw.business_id
     and summary.location_id = raw.location_id
     and summary.source = raw.source
     and summary.date = raw.transaction_date
    where raw.status not in ('duplicate', 'failed')
    group by raw.business_id, raw.location_id, raw.source, raw.transaction_date
  ),
  settlement_totals as (
    select
      settlement.business_id,
      settlement.location_id,
      settlement.source,
      settlement.settlement_date as date,
      coalesce(sum(settlement.net_amount), 0) as settlement_total
    from public.settlement_records settlement
    join scoped_summaries summary
      on summary.business_id = settlement.business_id
     and summary.location_id = settlement.location_id
     and summary.source = settlement.source
     and summary.date = settlement.settlement_date
    group by settlement.business_id, settlement.location_id, settlement.source, settlement.settlement_date
  ),
  journal_totals as (
    select
      journal.reference_id as summary_id,
      coalesce(sum(line.debit), 0) as journal_total
    from public.journal_entries journal
    join scoped_summaries summary on summary.id = journal.reference_id
    join public.journal_lines line on line.journal_entry_id = journal.id
    where journal.business_id = target_business_id
      and journal.status = 'posted'
    group by journal.reference_id
  )
  select
    summary.id as summary_id,
    summary.business_id,
    summary.location_id,
    summary.source,
    summary.date,
    summary.status,
    coalesce(raw.raw_total, 0) as raw_total,
    summary.net_amount as summary_total,
    coalesce(settlement.settlement_total, 0) as settlement_total,
    coalesce(journal.journal_total, 0) as journal_total,
    coalesce(raw.raw_total, 0) - summary.net_amount as raw_delta,
    case
      when coalesce(settlement.settlement_total, 0) = 0 then 0
      else coalesce(settlement.settlement_total, 0) - summary.net_amount
    end as settlement_delta,
    case
      when coalesce(journal.journal_total, 0) = 0 then 0
      else coalesce(journal.journal_total, 0) - summary.net_amount
    end as journal_delta
  from scoped_summaries summary
  left join raw_totals raw
    on raw.business_id = summary.business_id
   and raw.location_id = summary.location_id
   and raw.source = summary.source
   and raw.date = summary.date
  left join settlement_totals settlement
    on settlement.business_id = summary.business_id
   and settlement.location_id = summary.location_id
   and settlement.source = summary.source
   and settlement.date = summary.date
  left join journal_totals journal on journal.summary_id = summary.id
  order by summary.date desc;
$$;

revoke execute on function public.reconciliation_rollup(uuid, uuid, text, date, date, integer) from public, anon;
grant execute on function public.reconciliation_rollup(uuid, uuid, text, date, date, integer) to authenticated, service_role;
