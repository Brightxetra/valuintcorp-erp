-- Bounded rollup helpers for responsive route-specific workspace loading.
-- This keeps dashboard totals available without requiring every menu route to
-- hydrate the full transaction workspace.

create or replace function public.workspace_dashboard_rollup(target_business_id uuid)
returns table (
  revenue numeric,
  purchases numeric,
  accounts_receivable numeric,
  accounts_payable numeric,
  overdue_receivables numeric,
  overdue_payables numeric,
  payroll_cost numeric,
  raw_transaction_count bigint,
  summarized_revenue numeric,
  fixed_asset_book_value numeric
)
language sql
security invoker
set search_path = public
as $$
  with sales as (
    select
      coalesce(sum(total) filter (where status not in ('draft', 'void')), 0) as revenue,
      coalesce(sum(greatest(total - paid_amount, 0)) filter (where status not in ('draft', 'void')), 0) as accounts_receivable,
      coalesce(
        sum(greatest(total - paid_amount, 0)) filter (
          where status not in ('draft', 'void')
            and greatest(total - paid_amount, 0) > 0
            and due_date < current_date
        ),
        0
      ) as overdue_receivables
    from public.sales_invoices
    where business_id = target_business_id
  ),
  purchases as (
    select
      coalesce(sum(total) filter (where status not in ('draft', 'void')), 0) as purchases,
      coalesce(sum(greatest(total - paid_amount, 0)) filter (where status not in ('draft', 'void')), 0) as accounts_payable,
      coalesce(
        sum(greatest(total - paid_amount, 0)) filter (
          where status not in ('draft', 'void')
            and greatest(total - paid_amount, 0) > 0
            and due_date < current_date
        ),
        0
      ) as overdue_payables
    from public.purchase_bills
    where business_id = target_business_id
  ),
  payroll as (
    select coalesce(sum(gross_pay), 0) as payroll_cost
    from public.payroll_runs
    where business_id = target_business_id
  ),
  summaries as (
    select
      coalesce(sum(transaction_count), 0)::bigint as raw_transaction_count,
      coalesce(sum(net_amount), 0) as summarized_revenue
    from public.daily_transaction_summaries
    where business_id = target_business_id
      and status <> 'rolled_back'
  ),
  fixed_assets as (
    select
      greatest(
        coalesce((select sum(acquisition_cost) from public.fixed_assets where business_id = target_business_id), 0)
          - coalesce((select sum(amount) from public.fixed_asset_depreciation_lines where business_id = target_business_id), 0),
        0
      ) as fixed_asset_book_value
  )
  select
    sales.revenue,
    purchases.purchases,
    sales.accounts_receivable,
    purchases.accounts_payable,
    sales.overdue_receivables,
    purchases.overdue_payables,
    payroll.payroll_cost,
    summaries.raw_transaction_count,
    summaries.summarized_revenue,
    fixed_assets.fixed_asset_book_value
  from sales, purchases, payroll, summaries, fixed_assets
  where public.is_business_member(target_business_id);
$$;

grant execute on function public.workspace_dashboard_rollup(uuid) to authenticated, service_role;
