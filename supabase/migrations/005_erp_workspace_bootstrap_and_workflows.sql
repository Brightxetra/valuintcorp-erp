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
  current_period_start date := date_trunc('month', current_date)::date;
  current_period_end date := (date_trunc('month', current_date) + interval '1 month - 1 day')::date;
  default_warehouse_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  insert into public.businesses (legal_name, display_name, industry, owner_name, tax_id)
  values (legal_name, display_name, industry, owner_name, tax_id)
  returning id into new_business_id;

  insert into public.business_members (business_id, auth_user_id, role)
  values (new_business_id, auth.uid(), 'owner');

  insert into public.chart_of_accounts (business_id, code, name, type, normal_balance, category, is_system, is_active)
  values
    (new_business_id, '1000', 'Kas dan Bank', 'asset', 'debit', 'cash', true, true),
    (new_business_id, '1100', 'Piutang Usaha', 'asset', 'debit', 'receivable', true, true),
    (new_business_id, '1200', 'Persediaan', 'asset', 'debit', 'inventory', true, true),
    (new_business_id, '1300', 'Aset Tetap', 'asset', 'debit', 'fixed_asset', true, true),
    (new_business_id, '2000', 'Utang Usaha', 'liability', 'credit', 'payable', true, true),
    (new_business_id, '2100', 'Utang Gaji', 'liability', 'credit', 'payable', true, true),
    (new_business_id, '2200', 'Utang Pajak', 'liability', 'credit', 'tax', true, true),
    (new_business_id, '3000', 'Modal Pemilik', 'equity', 'credit', 'capital', true, true),
    (new_business_id, '3100', 'Prive Pemilik', 'equity', 'credit', 'capital', true, true),
    (new_business_id, '4000', 'Pendapatan Penjualan', 'revenue', 'credit', 'sales', true, true),
    (new_business_id, '4010', 'Pendapatan Jasa', 'revenue', 'credit', 'sales', true, true),
    (new_business_id, '5000', 'Harga Pokok Penjualan', 'expense', 'debit', 'cogs', true, true),
    (new_business_id, '5100', 'Beban Operasional', 'expense', 'debit', 'operating_expense', true, true),
    (new_business_id, '5200', 'Beban Gaji', 'expense', 'debit', 'payroll', true, true),
    (new_business_id, '5300', 'Beban Pajak', 'expense', 'debit', 'tax', true, true),
    (new_business_id, '6000', 'Penyesuaian Persediaan', 'expense', 'debit', 'adjustment', true, true);

  insert into public.report_periods (business_id, label, start_date, end_date, locked)
  values (new_business_id, to_char(current_period_start, 'YYYY-MM'), current_period_start, current_period_end, false);

  insert into public.tax_profiles (
    business_id,
    taxpayer_type,
    uses_final_umkm_rate,
    final_umkm_rate,
    coretax_status
  )
  values (new_business_id, 'individual_umkm', true, 0.005, 'not_started');

  insert into public.warehouses (business_id, code, name, location, is_active)
  values (new_business_id, 'UTAMA', 'Gudang Utama', 'Outlet utama', true)
  returning id into default_warehouse_id;

  insert into public.activity_events (business_id, actor_user_id, actor_name, module, action, description)
  values (
    new_business_id,
    auth.uid(),
    coalesce(auth.uid()::text, 'System'),
    'accounting',
    'business bootstrapped',
    'Business, owner role, COA, report period, tax profile, and default warehouse were created.'
  );

  return new_business_id;
end;
$$;

create or replace function public.set_report_period_lock(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_business_id uuid := (payload->>'businessId')::uuid;
  period_label text := payload->>'label';
  period_start date := (payload->>'startDate')::date;
  period_end date := (payload->>'endDate')::date;
  should_lock boolean := (payload->>'locked')::boolean;
  period_id uuid;
  role text;
begin
  role := public.require_posting_role(target_business_id, array['owner', 'finance_admin', 'system_admin']);

  if period_end < period_start then
    raise exception 'Period end cannot be earlier than start.';
  end if;

  insert into public.report_periods (
    business_id,
    label,
    start_date,
    end_date,
    locked,
    locked_at,
    locked_by
  )
  values (
    target_business_id,
    period_label,
    period_start,
    period_end,
    should_lock,
    case when should_lock then now() else null end,
    case when should_lock then auth.uid() else null end
  )
  on conflict (business_id, start_date, end_date)
  do update set
    label = excluded.label,
    locked = excluded.locked,
    locked_at = excluded.locked_at,
    locked_by = excluded.locked_by
  returning id into period_id;

  insert into public.activity_events (business_id, actor_user_id, actor_name, module, action, description)
  values (
    target_business_id,
    auth.uid(),
    coalesce(auth.uid()::text, 'System'),
    'accounting',
    case when should_lock then 'period locked' else 'period reopened' end,
    'Period ' || period_label || ' was updated by role ' || role || '.'
  );

  return period_id;
end;
$$;

create or replace function public.post_stock_transfer(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_business_id uuid := (payload->>'businessId')::uuid;
  target_item_id uuid := (payload->>'itemId')::uuid;
  from_warehouse uuid := (payload->>'fromWarehouseId')::uuid;
  to_warehouse uuid := (payload->>'toWarehouseId')::uuid;
  transfer_date date := (payload->>'date')::date;
  qty numeric := (payload->>'quantity')::numeric;
  transfer_memo text := nullif(payload->>'memo', '');
  transfer_id uuid;
  transfer_no text;
  product_record record;
  unit_value numeric;
  role text;
begin
  role := public.require_posting_role(target_business_id, array['owner', 'finance_admin', 'staff', 'system_admin']);

  if public.is_period_locked(target_business_id, transfer_date) then
    raise exception 'Period is locked. Use a correction or reversal entry.';
  end if;

  if from_warehouse = to_warehouse then
    raise exception 'Source and destination warehouse must be different.';
  end if;

  if qty <= 0 then
    raise exception 'Transfer quantity must be positive.';
  end if;

  select * into product_record
  from public.products
  where id = target_item_id and business_id = target_business_id and is_active = true and track_stock = true;

  if product_record.id is null then
    raise exception 'Product is not active or does not track stock.';
  end if;

  if not exists (select 1 from public.warehouses where id = from_warehouse and business_id = target_business_id and is_active = true) then
    raise exception 'Source warehouse is not active.';
  end if;

  if not exists (select 1 from public.warehouses where id = to_warehouse and business_id = target_business_id and is_active = true) then
    raise exception 'Destination warehouse is not active.';
  end if;

  if public.current_stock_quantity(target_business_id, target_item_id, from_warehouse) < qty then
    raise exception 'Posting this transfer would create negative stock.';
  end if;

  unit_value := coalesce(product_record.purchase_price, 0) * qty;
  transfer_no := public.next_document_no(target_business_id, 'TRF');

  insert into public.stock_transfers (
    business_id,
    transfer_no,
    date,
    item_id,
    from_warehouse_id,
    to_warehouse_id,
    quantity,
    status,
    memo,
    created_by
  )
  values (
    target_business_id,
    transfer_no,
    transfer_date,
    target_item_id,
    from_warehouse,
    to_warehouse,
    qty,
    'posted',
    transfer_memo,
    auth.uid()
  )
  returning id into transfer_id;

  insert into public.stock_movements (business_id, item_id, warehouse_id, date, type, quantity, value, memo)
  values
    (target_business_id, target_item_id, from_warehouse, transfer_date, 'transfer_out', qty, unit_value, transfer_no),
    (target_business_id, target_item_id, to_warehouse, transfer_date, 'transfer_in', qty, unit_value, transfer_no);

  insert into public.activity_events (business_id, actor_user_id, actor_name, module, action, description)
  values (
    target_business_id,
    auth.uid(),
    coalesce(auth.uid()::text, 'System'),
    'inventory',
    'stock transfer',
    transfer_no || ' posted by role ' || role || '.'
  );

  return transfer_id;
end;
$$;

create or replace function public.void_document(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_business_id uuid := (payload->>'businessId')::uuid;
  target_document_type text := payload->>'documentType';
  target_document_id uuid := (payload->>'documentId')::uuid;
  void_date date := (payload->>'date')::date;
  void_reason text := payload->>'reason';
  original_journal_id uuid;
  reversal_id uuid;
  reversal_lines jsonb;
  role text;
  transfer_record record;
begin
  role := public.require_posting_role(target_business_id, array['owner', 'finance_admin', 'system_admin']);

  if public.is_period_locked(target_business_id, void_date) then
    raise exception 'Void date is inside a locked period.';
  end if;

  if target_document_type = 'sales_invoice' then
    update public.sales_invoices
    set status = 'void'
    where id = target_document_id and business_id = target_business_id and status <> 'void'
    returning journal_entry_id into original_journal_id;
  elsif target_document_type = 'purchase_bill' then
    update public.purchase_bills
    set status = 'void'
    where id = target_document_id and business_id = target_business_id and status <> 'void'
    returning journal_entry_id into original_journal_id;
  elsif target_document_type = 'payment' then
    update public.payments
    set status = 'void'
    where id = target_document_id and business_id = target_business_id and status <> 'void'
    returning journal_entry_id into original_journal_id;
  elsif target_document_type = 'stock_adjustment' then
    update public.stock_adjustments
    set status = 'void'
    where id = target_document_id and business_id = target_business_id and status <> 'void'
    returning journal_entry_id into original_journal_id;
  elsif target_document_type = 'payroll_run' then
    select journal_entry_id into original_journal_id
    from public.payroll_runs
    where id = target_document_id and business_id = target_business_id;
  elsif target_document_type = 'stock_transfer' then
    update public.stock_transfers
    set status = 'void'
    where id = target_document_id and business_id = target_business_id and status <> 'void'
    returning * into transfer_record;

    if transfer_record.id is not null then
      insert into public.stock_movements (business_id, item_id, warehouse_id, date, type, quantity, value, memo)
      values
        (target_business_id, transfer_record.item_id, transfer_record.from_warehouse_id, void_date, 'transfer_in', transfer_record.quantity, 0, 'Void ' || transfer_record.transfer_no),
        (target_business_id, transfer_record.item_id, transfer_record.to_warehouse_id, void_date, 'transfer_out', transfer_record.quantity, 0, 'Void ' || transfer_record.transfer_no);
    end if;
  else
    raise exception 'Unsupported document type %. ', target_document_type;
  end if;

  if original_journal_id is not null then
    select jsonb_agg(
      jsonb_build_object(
        'accountCode', account.code,
        'debit', line.credit,
        'credit', line.debit,
        'memo', 'Void ' || target_document_type
      )
    )
    into reversal_lines
    from public.journal_lines line
    join public.chart_of_accounts account on account.id = line.account_id
    where line.journal_entry_id = original_journal_id;

    reversal_id := public.create_posted_journal(
      target_business_id,
      void_date,
      'Reversal ' || target_document_type || ' ' || target_document_id::text,
      'reversal',
      target_document_id,
      role,
      coalesce(reversal_lines, '[]'::jsonb)
    );

    update public.journal_entries
    set status = 'reversed',
        reversed_entry_id = reversal_id
    where id = original_journal_id
      and business_id = target_business_id;

    insert into public.stock_movements (business_id, item_id, warehouse_id, date, type, quantity, value, journal_entry_id, memo)
    select
      movement.business_id,
      movement.item_id,
      movement.warehouse_id,
      void_date,
      case
        when movement.type in ('sale', 'transfer_out', 'adjustment_out') then 'adjustment_in'
        else 'adjustment_out'
      end,
      movement.quantity,
      movement.value,
      reversal_id,
      'Void ' || coalesce(movement.memo, target_document_id::text)
    from public.stock_movements movement
    where movement.business_id = target_business_id
      and movement.journal_entry_id = original_journal_id;
  end if;

  insert into public.activity_events (business_id, actor_user_id, actor_name, module, action, description)
  values (
    target_business_id,
    auth.uid(),
    coalesce(auth.uid()::text, 'System'),
    'accounting',
    'document voided',
    target_document_type || ' ' || target_document_id::text || ' voided by role ' || role || ': ' || void_reason
  );

  return coalesce(reversal_id, target_document_id);
end;
$$;
