begin;

set local lock_timeout = '5s';
set local statement_timeout = '45s';

do $$
begin
  if current_user <> 'postgres' then
    raise exception 'Sensitive-read boundary migrations must run as postgres.';
  end if;
end;
$$;

create or replace function app_private.member_has_any_permission(
  target_business_id uuid,
  target_permissions text[]
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce(
    app_private.member_effective_permissions_for_actor(
      target_business_id,
      auth.uid()
    ) && coalesce(target_permissions, '{}'::text[]),
    false
  );
$$;

create or replace function app_private.member_has_business_wide_scope(
  target_business_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce((
    select member.role in ('owner', 'system_admin')
      or member.access_scope = 'role'
    from public.business_members member
    where member.business_id = target_business_id
      and member.auth_user_id = auth.uid()
    limit 1
  ), false);
$$;

create or replace function app_private.member_has_location_access_for_actor(
  target_business_id uuid,
  actor_user_id uuid,
  target_location_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce((
    select case
      when member.role in ('owner', 'system_admin')
        or member.access_scope = 'role'
      then true
      else target_location_id = any(coalesce(member.location_ids, '{}'::uuid[]))
    end
    from public.business_members member
    where member.business_id = target_business_id
      and member.auth_user_id = actor_user_id
    limit 1
  ), false);
$$;

create or replace function app_private.member_can_read_sales_invoice(
  target_business_id uuid,
  target_invoice_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select app_private.member_has_any_permission(
    target_business_id,
    array['accounting:read', 'accounting:write', 'reports:export', 'tax:prepare']
  )
  and exists (
    select 1
    from public.sales_invoices invoice
    where invoice.business_id = target_business_id
      and invoice.id = target_invoice_id
      and (
        (
          invoice.location_id is not null
          and app_private.member_has_location_access(
            target_business_id,
            invoice.location_id
          )
        )
        or (
          invoice.location_id is null
          and app_private.member_has_business_wide_scope(target_business_id)
        )
      )
  );
$$;

create or replace function app_private.member_can_read_purchase_bill(
  target_business_id uuid,
  target_bill_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select app_private.member_has_any_permission(
    target_business_id,
    array['accounting:read', 'accounting:write', 'reports:export', 'tax:prepare']
  )
  and exists (
    select 1
    from public.purchase_bills bill
    where bill.business_id = target_business_id
      and bill.id = target_bill_id
      and (
        app_private.member_has_business_wide_scope(target_business_id)
        or (
          exists (
            select 1
            from public.purchase_bill_lines line
            where line.business_id = target_business_id
              and line.purchase_bill_id = bill.id
              and line.warehouse_id is not null
          )
          and not exists (
            select 1
            from public.purchase_bill_lines line
            where line.business_id = target_business_id
              and line.purchase_bill_id = bill.id
              and (
                line.warehouse_id is null
                or not app_private.member_has_warehouse_access(
                  target_business_id,
                  line.warehouse_id
                )
              )
          )
        )
      )
  );
$$;

create or replace function app_private.member_can_read_payment(
  target_business_id uuid,
  target_payment_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce((
    select case payment.document_type
      when 'sales_invoice' then
        app_private.member_can_read_sales_invoice(
          target_business_id,
          payment.document_id
        )
      when 'purchase_bill' then
        app_private.member_can_read_purchase_bill(
          target_business_id,
          payment.document_id
        )
      when 'payroll_run' then
        app_private.member_has_permission(target_business_id, 'payroll:run')
      else false
    end
    from public.payments payment
    where payment.business_id = target_business_id
      and payment.id = target_payment_id
    limit 1
  ), false);
$$;

create or replace function app_private.member_can_read_attachment(
  target_business_id uuid,
  target_owner_type text,
  target_owner_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select case target_owner_type
    when 'sales_invoice' then
      app_private.member_can_read_sales_invoice(target_business_id, target_owner_id)
    when 'purchase_bill' then
      app_private.member_can_read_purchase_bill(target_business_id, target_owner_id)
    when 'payment' then
      app_private.member_can_read_payment(target_business_id, target_owner_id)
    when 'payroll_run' then
      app_private.member_has_permission(target_business_id, 'payroll:run')
    when 'fixed_asset' then
      app_private.member_has_any_permission(
        target_business_id,
        array['accounting:read', 'accounting:write']
      )
    else false
  end;
$$;

alter function app_private.member_has_any_permission(uuid, text[]) owner to postgres;
alter function app_private.member_has_business_wide_scope(uuid) owner to postgres;
alter function app_private.member_has_location_access_for_actor(uuid, uuid, uuid) owner to postgres;
alter function app_private.member_can_read_sales_invoice(uuid, uuid) owner to postgres;
alter function app_private.member_can_read_purchase_bill(uuid, uuid) owner to postgres;
alter function app_private.member_can_read_payment(uuid, uuid) owner to postgres;
alter function app_private.member_can_read_attachment(uuid, text, uuid) owner to postgres;

revoke all on function app_private.member_has_any_permission(uuid, text[])
  from public, anon, authenticated, service_role;
revoke all on function app_private.member_has_business_wide_scope(uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.member_has_location_access_for_actor(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.member_can_read_sales_invoice(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.member_can_read_purchase_bill(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.member_can_read_payment(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.member_can_read_attachment(uuid, text, uuid)
  from public, anon, authenticated, service_role;

grant execute on function app_private.member_has_any_permission(uuid, text[])
  to authenticated;
grant execute on function app_private.member_has_business_wide_scope(uuid)
  to authenticated;
grant execute on function app_private.member_can_read_sales_invoice(uuid, uuid)
  to authenticated;
grant execute on function app_private.member_can_read_purchase_bill(uuid, uuid)
  to authenticated;
grant execute on function app_private.member_can_read_payment(uuid, uuid)
  to authenticated;
grant execute on function app_private.member_can_read_attachment(uuid, text, uuid)
  to authenticated;
grant execute on function app_private.member_has_location_access(uuid, uuid)
  to authenticated;
grant execute on function app_private.member_has_warehouse_access(uuid, uuid)
  to authenticated;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select
      namespace.nspname as schema_name,
      relation.relname as table_name,
      policy.polname as policy_name
    from pg_catalog.pg_policy policy
    join pg_catalog.pg_class relation on relation.oid = policy.polrelid
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = any(array[
        'sales_invoices', 'sales_invoice_lines',
        'purchase_bills', 'purchase_bill_lines',
        'payments', 'customers', 'suppliers', 'branch_expenses',
        'payroll_runs', 'audit_logs', 'attachments',
        'product_structures', 'product_structure_lines',
        'demand_forecasts', 'mrp_runs', 'mrp_recommendations',
        'production_orders', 'production_order_lines'
      ])
      and policy.polcmd = 'r'
  loop
    execute pg_catalog.format(
      'drop policy %I on %I.%I',
      policy_record.policy_name,
      policy_record.schema_name,
      policy_record.table_name
    );
  end loop;
end;
$$;

create policy "authorized members can read sales invoices"
on public.sales_invoices for select to authenticated
using (
  (select app_private.member_can_read_sales_invoice(business_id, id))
);

create policy "authorized members can read sales invoice lines"
on public.sales_invoice_lines for select to authenticated
using (
  (select app_private.member_can_read_sales_invoice(business_id, sales_invoice_id))
);

create policy "authorized members can read purchase bills"
on public.purchase_bills for select to authenticated
using (
  (select app_private.member_can_read_purchase_bill(business_id, id))
);

create policy "authorized members can read purchase bill lines"
on public.purchase_bill_lines for select to authenticated
using (
  (select app_private.member_has_any_permission(
    business_id,
    array['accounting:read', 'accounting:write', 'reports:export', 'tax:prepare']
  ))
  and (
    (
      warehouse_id is not null
      and (select app_private.member_has_warehouse_access(business_id, warehouse_id))
    )
    or (
      warehouse_id is null
      and (select app_private.member_has_business_wide_scope(business_id))
    )
  )
);

create policy "authorized members can read payments"
on public.payments for select to authenticated
using (
  (select app_private.member_can_read_payment(business_id, id))
);

create policy "accounting members can read customers"
on public.customers for select to authenticated
using (
  (select app_private.member_has_any_permission(
    business_id,
    array['accounting:read', 'accounting:write']
  ))
);

create policy "accounting members can read suppliers"
on public.suppliers for select to authenticated
using (
  (select app_private.member_has_any_permission(
    business_id,
    array['accounting:read', 'accounting:write']
  ))
);

create policy "assigned pos members can read branch expenses"
on public.branch_expenses for select to authenticated
using (
  (select app_private.member_has_permission(business_id, 'pos:read'))
  and (select app_private.member_has_location_access(business_id, location_id))
);

create policy "payroll members can read payroll runs"
on public.payroll_runs for select to authenticated
using (
  (select app_private.member_has_permission(business_id, 'payroll:run'))
);

create policy "authorized members can read attachments"
on public.attachments for select to authenticated
using (
  (select app_private.member_can_read_attachment(
    business_id,
    owner_type,
    owner_id
  ))
);

create policy "inventory members can read product structures"
on public.product_structures for select to authenticated
using (
  (select app_private.member_has_permission(business_id, 'inventory:manage'))
);

create policy "inventory members can read product structure lines"
on public.product_structure_lines for select to authenticated
using (
  (select app_private.member_has_permission(business_id, 'inventory:manage'))
);

create policy "assigned inventory members can read demand forecasts"
on public.demand_forecasts for select to authenticated
using (
  (select app_private.member_has_permission(business_id, 'inventory:manage'))
  and (
    (
      location_id is not null
      and (select app_private.member_has_location_access(business_id, location_id))
    )
    or (
      location_id is null
      and (select app_private.member_has_business_wide_scope(business_id))
    )
  )
);

create policy "inventory members can read mrp runs"
on public.mrp_runs for select to authenticated
using (
  (select app_private.member_has_permission(business_id, 'inventory:manage'))
);

create policy "inventory members can read mrp recommendations"
on public.mrp_recommendations for select to authenticated
using (
  (select app_private.member_has_permission(business_id, 'inventory:manage'))
);

create policy "assigned inventory members can read production orders"
on public.production_orders for select to authenticated
using (
  (select app_private.member_has_permission(business_id, 'inventory:manage'))
  and (
    (
      warehouse_id is not null
      and (select app_private.member_has_warehouse_access(business_id, warehouse_id))
    )
    or (
      warehouse_id is null
      and (select app_private.member_has_business_wide_scope(business_id))
    )
  )
);

create policy "assigned inventory members can read production order lines"
on public.production_order_lines for select to authenticated
using (
  (select app_private.member_has_permission(business_id, 'inventory:manage'))
  and (
    (
      warehouse_id is not null
      and (select app_private.member_has_warehouse_access(business_id, warehouse_id))
    )
    or (
      warehouse_id is null
      and exists (
        select 1
        from public.production_orders production_order
        where production_order.business_id = production_order_lines.business_id
          and production_order.id = production_order_lines.production_order_id
          and (
            (
              production_order.warehouse_id is not null
              and app_private.member_has_warehouse_access(
                production_order.business_id,
                production_order.warehouse_id
              )
            )
            or (
              production_order.warehouse_id is null
              and app_private.member_has_business_wide_scope(
                production_order.business_id
              )
            )
          )
      )
    )
  )
);

do $$
declare
  table_name text;
  policy_record record;
begin
  for policy_record in
    select
      relation.relname as table_name,
      policy.polname as policy_name
    from pg_catalog.pg_policy policy
    join pg_catalog.pg_class relation on relation.oid = policy.polrelid
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = any(array[
        'product_structures', 'product_structure_lines',
        'demand_forecasts', 'mrp_runs', 'mrp_recommendations',
        'production_orders', 'production_order_lines'
      ])
      and policy.polcmd = '*'
  loop
    execute pg_catalog.format(
      'drop policy %I on public.%I',
      policy_record.policy_name,
      policy_record.table_name
    );
  end loop;

  foreach table_name in array array[
    'product_structures', 'product_structure_lines',
    'demand_forecasts', 'mrp_runs', 'mrp_recommendations',
    'production_orders', 'production_order_lines'
  ]
  loop
    execute pg_catalog.format(
      'create policy %I on public.%I for insert to authenticated with check ((select app_private.member_has_permission(business_id, %L)))',
      'inventory members can insert ' || table_name,
      table_name,
      'inventory:manage'
    );
    execute pg_catalog.format(
      'create policy %I on public.%I for update to authenticated using ((select app_private.member_has_permission(business_id, %L))) with check ((select app_private.member_has_permission(business_id, %L)))',
      'inventory members can update ' || table_name,
      table_name,
      'inventory:manage',
      'inventory:manage'
    );
    execute pg_catalog.format(
      'create policy %I on public.%I for delete to authenticated using ((select app_private.member_has_permission(business_id, %L)))',
      'inventory members can delete ' || table_name,
      table_name,
      'inventory:manage'
    );
  end loop;
end;
$$;

create or replace function app_private.redact_audit_snapshot(
  target_table_name text,
  snapshot jsonb
)
returns jsonb
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when snapshot is null then null
    when target_table_name = 'payroll_runs' then
      snapshot - array[
        'gross_pay', 'deductions', 'tax_withheld', 'net_pay', 'components'
      ]::text[]
    else snapshot
  end;
$$;

alter function app_private.redact_audit_snapshot(text, jsonb) owner to postgres;
revoke all on function app_private.redact_audit_snapshot(text, jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
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
    case
      when tg_op in ('UPDATE', 'DELETE')
      then app_private.redact_audit_snapshot(tg_table_name, to_jsonb(old))
      else null
    end,
    case
      when tg_op in ('INSERT', 'UPDATE')
      then app_private.redact_audit_snapshot(tg_table_name, to_jsonb(new))
      else null
    end
  );

  return coalesce(new, old);
end;
$$;

alter function public.audit_row_change() owner to postgres;
revoke all on function public.audit_row_change()
  from public, anon, authenticated, service_role;

update public.audit_logs
set
  before_data = app_private.redact_audit_snapshot(table_name, before_data),
  after_data = app_private.redact_audit_snapshot(table_name, after_data)
where table_name = 'payroll_runs'
  and (
    coalesce(before_data, '{}'::jsonb) ?| array[
      'gross_pay', 'deductions', 'tax_withheld', 'net_pay', 'components'
    ]
    or coalesce(after_data, '{}'::jsonb) ?| array[
      'gross_pay', 'deductions', 'tax_withheld', 'net_pay', 'components'
    ]
  );

create policy "permission scoped members can read audit logs"
on public.audit_logs for select to authenticated
using (
  (
    table_name = 'payroll_runs'
    and (select app_private.member_has_permission(business_id, 'payroll:run'))
  )
  or (
    table_name <> 'payroll_runs'
    and (select app_private.member_has_permission(business_id, 'accounting:read'))
  )
);

revoke all privileges on table public.attachments
from public, anon, authenticated;
grant select on table public.attachments to authenticated;

drop policy if exists "members can read erp attachment objects"
on storage.objects;
drop policy if exists "members can write erp attachment objects"
on storage.objects;

revoke all on function public.reconciliation_rollup(
  uuid, uuid, text, date, date, integer
) from public, anon, authenticated, service_role;

create or replace function public.reconciliation_rollup(
  target_business_id uuid,
  actor_user_id uuid,
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
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  if actor_user_id is null
    or not app_private.member_has_permission_for_actor(
      target_business_id,
      actor_user_id,
      'accounting:read'
    )
  then
    raise exception 'Accounting read permission is required.'
      using errcode = '42501';
  end if;

  if target_location_id is not null
    and not app_private.member_has_location_access_for_actor(
      target_business_id,
      actor_user_id,
      target_location_id
    )
  then
    raise exception 'The requested location is outside the member assignment.'
      using errcode = '42501';
  end if;

  return query
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
      and app_private.member_has_location_access_for_actor(
        target_business_id,
        actor_user_id,
        summary.location_id
      )
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
    group by settlement.business_id, settlement.location_id,
      settlement.source, settlement.settlement_date
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
end;
$$;

alter function public.reconciliation_rollup(
  uuid, uuid, uuid, text, date, date, integer
) owner to postgres;
revoke all on function public.reconciliation_rollup(
  uuid, uuid, uuid, text, date, date, integer
) from public, anon, authenticated, service_role;
grant execute on function public.reconciliation_rollup(
  uuid, uuid, uuid, text, date, date, integer
) to service_role;

commit;
