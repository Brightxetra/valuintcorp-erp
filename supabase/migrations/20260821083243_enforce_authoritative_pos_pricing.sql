begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
begin
  if current_user <> 'postgres' then
    raise exception 'POS pricing migrations must run as the postgres role.'
      using errcode = '42501';
  end if;
end;
$$;

-- Caller-provided prices are intentionally ignored at the pre-lock boundary.
-- The posting function below resolves the catalog price after these canonical
-- inventory locks have been acquired.
create or replace function app_private.lock_pos_sale_inventory_keys(payload jsonb)
returns void
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  target_business_id uuid := (payload->>'businessId')::uuid;
  target_location_id uuid := (payload->>'locationId')::uuid;
  sale_date date := coalesce(nullif(payload->>'date', '')::date, current_date);
  payment_method_value text := coalesce(nullif(payload->>'paymentMethod', ''), 'cash');
  line_items jsonb := payload->'items';
  line_item jsonb;
  location_record record;
  affected_item_id uuid;
  line_product_id uuid;
  qty numeric;
begin
  if pg_catalog.jsonb_typeof(line_items) <> 'array'
    or pg_catalog.jsonb_array_length(line_items) = 0
  then
    raise exception 'At least one POS item is required.' using errcode = '22023';
  end if;

  if payment_method_value not in ('cash', 'bank_transfer', 'qris', 'marketplace', 'other') then
    raise exception 'Unsupported payment method.' using errcode = '22023';
  end if;

  perform app_private.require_pos_access(
    target_business_id,
    target_location_id,
    'pos:sell'
  );

  if public.is_period_locked(target_business_id, sale_date) then
    raise exception 'Period is locked. Use a correction or reversal entry.';
  end if;

  select location.id, location.warehouse_id
  into location_record
  from public.locations location
  where location.id = target_location_id
    and location.business_id = target_business_id
    and location.is_active = true
    and location.type in ('branch', 'outlet', 'store');

  if location_record.id is null or location_record.warehouse_id is null then
    raise exception 'An active branch with a warehouse is required for POS.'
      using errcode = '22023';
  end if;

  for line_item in
    select item.value
    from pg_catalog.jsonb_array_elements(line_items) with ordinality
      as item(value, position)
    order by item.position
  loop
    line_product_id := nullif(line_item->>'productId', '')::uuid;
    qty := (line_item->>'quantity')::numeric;

    if line_product_id is null or qty is null or qty <= 0 then
      raise exception 'Each POS item requires a product and positive quantity.'
        using errcode = '22023';
    end if;
  end loop;

  for affected_item_id in
    with requested_items as (
      select distinct nullif(item.value->>'productId', '')::uuid as item_id
      from pg_catalog.jsonb_array_elements(line_items) as item(value)
    ),
    affected_items as (
      select requested_item.item_id
      from requested_items requested_item

      union

      select structure_line.component_product_id
      from requested_items requested_item
      join public.products parent_product
        on parent_product.id = requested_item.item_id
        and parent_product.business_id = target_business_id
        and parent_product.fulfillment_method = 'recipe_on_sale'
      join public.product_structures structure
        on structure.business_id = target_business_id
        and structure.parent_product_id = parent_product.id
        and structure.is_active = true
      join public.product_structure_lines structure_line
        on structure_line.business_id = target_business_id
        and structure_line.structure_id = structure.id
      join public.products component_product
        on component_product.id = structure_line.component_product_id
        and component_product.business_id = target_business_id
        and component_product.track_stock = true
    )
    select affected_item.item_id
    from affected_items affected_item
    where affected_item.item_id is not null
    order by affected_item.item_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'inventory-stock|'
          || target_business_id::text || '|'
          || affected_item_id::text || '|'
          || location_record.warehouse_id::text,
        0
      )
    );
  end loop;
end;
$$;

alter function app_private.lock_pos_sale_inventory_keys(jsonb) owner to postgres;

comment on function app_private.lock_pos_sale_inventory_keys(jsonb) is
  'Validates product identity and quantity only, then locks all POS parent/component inventory keys in UUID order. Caller prices are ignored.';

revoke all on function app_private.lock_pos_sale_inventory_keys(jsonb)
  from public, anon, authenticated, service_role;

-- Version the application entry point so an application deployment cannot
-- silently fall back to the legacy caller-priced command when this migration
-- has not reached a database yet.
create or replace function public.post_pos_sale_v2(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  trusted_payload jsonb := payload - 'actorUserId';
begin
  perform app_private.apply_request_actor(
    nullif(payload->>'actorUserId', '')::uuid
  );

  perform app_private.lock_pos_sale_inventory_keys(trusted_payload);

  return public.post_pos_sale_internal(trusted_payload);
end;
$$;

alter function public.post_pos_sale_v2(jsonb) owner to postgres;

comment on function public.post_pos_sale_v2(jsonb) is
  'Service-role-only actor-bound POS v2 entry point. Requires authoritative catalog pricing and canonical inventory pre-locking.';

revoke all on function public.post_pos_sale_v2(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.post_pos_sale_v2(jsonb)
  to service_role;

create or replace function public.post_pos_sale_internal(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  target_business_id uuid := (payload->>'businessId')::uuid;
  target_location_id uuid := (payload->>'locationId')::uuid;
  sale_date date := coalesce(nullif(payload->>'date', '')::date, current_date);
  payment_method_value text := coalesce(nullif(payload->>'paymentMethod', ''), 'cash');
  line_items jsonb := payload->'items';
  resolved_items jsonb := '[]'::jsonb;
  line_item jsonb;
  location_record record;
  product_record record;
  structure_record record;
  component_record record;
  structure_line record;
  line_product_id uuid;
  qty numeric;
  unit_price numeric;
  unit_cogs numeric;
  component_required numeric;
  component_unit_cost numeric;
  invoice_id uuid;
  invoice_no text;
  sales_journal_id uuid;
  payment_id uuid;
  payment_no text;
  payment_journal_id uuid;
  member_role text;
  total numeric := 0;
  cogs_total numeric := 0;
begin
  if pg_catalog.jsonb_typeof(line_items) <> 'array'
    or pg_catalog.jsonb_array_length(line_items) = 0
  then
    raise exception 'At least one POS item is required.' using errcode = '22023';
  end if;

  if payment_method_value not in ('cash', 'bank_transfer', 'qris', 'marketplace', 'other') then
    raise exception 'Unsupported payment method.' using errcode = '22023';
  end if;

  member_role := app_private.require_pos_access(
    target_business_id,
    target_location_id,
    'pos:sell'
  );

  if public.is_period_locked(target_business_id, sale_date) then
    raise exception 'Period is locked. Use a correction or reversal entry.';
  end if;

  select location.id, location.warehouse_id
  into location_record
  from public.locations location
  where location.id = target_location_id
    and location.business_id = target_business_id
    and location.is_active = true
    and location.type in ('branch', 'outlet', 'store')
  for share of location;

  if location_record.id is null or location_record.warehouse_id is null then
    raise exception 'An active branch with a warehouse is required for POS.'
      using errcode = '22023';
  end if;

  -- Lock all same-tenant catalog rows canonically so price, active state, and
  -- sellability cannot change while this transaction builds its documents.
  perform product.id
  from public.products product
  where product.business_id = target_business_id
    and product.id in (
      select distinct nullif(item.value->>'productId', '')::uuid
      from pg_catalog.jsonb_array_elements(line_items) as item(value)
    )
  order by product.id
  for share of product;

  for line_item in
    select item.value
    from pg_catalog.jsonb_array_elements(line_items) with ordinality
      as item(value, position)
    order by item.position
  loop
    line_product_id := nullif(line_item->>'productId', '')::uuid;
    qty := (line_item->>'quantity')::numeric;

    if line_product_id is null or qty is null or qty <= 0 then
      raise exception 'Each POS item requires a product and positive quantity.'
        using errcode = '22023';
    end if;

    select
      product.id,
      product.name,
      product.track_stock,
      product.fulfillment_method,
      product.selling_price
    into product_record
    from public.products product
    where product.id = line_product_id
      and product.business_id = target_business_id
      and product.is_active = true
      and product.is_sellable = true;

    if product_record.id is null then
      raise exception 'Product is not active or sellable.' using errcode = '22023';
    end if;

    if product_record.selling_price <= 0 then
      raise exception 'Product POS price must be greater than zero.' using errcode = '22023';
    end if;

    select
      structure.id,
      structure.output_quantity,
      structure.yield_percent
    into structure_record
    from public.product_structures structure
    where structure.business_id = target_business_id
      and structure.parent_product_id = line_product_id
      and structure.is_active = true
    order by structure.updated_at desc
    limit 1;

    if structure_record.id is not null
      and product_record.fulfillment_method = 'recipe_on_sale'
    then
      for structure_line in
        select
          line.component_product_id,
          line.quantity,
          line.waste_percent
        from public.product_structure_lines line
        where line.business_id = target_business_id
          and line.structure_id = structure_record.id
      loop
        component_required := qty * structure_line.quantity
          * (1 + structure_line.waste_percent / 100)
          / greatest(structure_record.output_quantity, 1)
          / (greatest(structure_record.yield_percent, 1) / 100);

        select product.id, product.track_stock
        into component_record
        from public.products product
        where product.id = structure_line.component_product_id
          and product.business_id = target_business_id;

        if component_record.track_stock
          and public.current_stock_quantity(
            target_business_id,
            component_record.id,
            location_record.warehouse_id
          ) < component_required
        then
          raise exception 'Insufficient ingredient stock at this branch.';
        end if;
      end loop;
    elsif product_record.track_stock
      and public.current_stock_quantity(
        target_business_id,
        line_product_id,
        location_record.warehouse_id
      ) < qty
    then
      raise exception 'Insufficient stock at this branch.';
    end if;

    unit_price := product_record.selling_price;
    unit_cogs := public.product_unit_cost(target_business_id, line_product_id);
    total := total + (qty * unit_price);
    cogs_total := cogs_total + case
      when product_record.track_stock or structure_record.id is not null
        then qty * unit_cogs
      else 0
    end;

    resolved_items := resolved_items || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'productId', product_record.id,
        'quantity', qty,
        'unitPrice', unit_price,
        'unitCogs', unit_cogs,
        'description', product_record.name
      )
    );
  end loop;

  invoice_no := public.next_document_no(target_business_id, 'POS');

  insert into public.sales_invoices (
    business_id,
    invoice_no,
    customer_id,
    date,
    due_date,
    status,
    total,
    paid_amount,
    location_id,
    source,
    created_by
  )
  select
    target_business_id,
    invoice_no,
    customer.id,
    sale_date,
    sale_date,
    'paid',
    total,
    total,
    target_location_id,
    'pos',
    auth.uid()
  from public.customers customer
  where customer.business_id = target_business_id
    and customer.code = 'POS-UMUM'
    and customer.is_active = true
  order by customer.created_at
  limit 1
  returning id into invoice_id;

  if invoice_id is null then
    raise exception 'Create one active customer before using POS.' using errcode = '22023';
  end if;

  for line_item in
    select item.value
    from pg_catalog.jsonb_array_elements(resolved_items) with ordinality
      as item(value, position)
    order by item.position
  loop
    line_product_id := (line_item->>'productId')::uuid;
    qty := (line_item->>'quantity')::numeric;
    unit_price := (line_item->>'unitPrice')::numeric;
    unit_cogs := (line_item->>'unitCogs')::numeric;

    insert into public.sales_invoice_lines (
      business_id,
      sales_invoice_id,
      product_id,
      warehouse_id,
      description,
      quantity,
      unit_price,
      cogs
    ) values (
      target_business_id,
      invoice_id,
      line_product_id,
      location_record.warehouse_id,
      line_item->>'description',
      qty,
      unit_price,
      unit_cogs
    );
  end loop;

  sales_journal_id := public.create_posted_journal(
    target_business_id,
    sale_date,
    'Penjualan POS ' || invoice_no,
    'manual_transaction',
    invoice_id,
    member_role,
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'accountCode', '1100', 'debit', total, 'credit', 0, 'memo', invoice_no
      ),
      pg_catalog.jsonb_build_object(
        'accountCode', '4000', 'debit', 0, 'credit', total, 'memo', invoice_no
      )
    ) || case when cogs_total > 0 then pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'accountCode', '5000', 'debit', cogs_total, 'credit', 0, 'memo', invoice_no
      ),
      pg_catalog.jsonb_build_object(
        'accountCode', '1200', 'debit', 0, 'credit', cogs_total, 'memo', invoice_no
      )
    ) else '[]'::jsonb end
  );

  update public.sales_invoices
  set journal_entry_id = sales_journal_id
  where id = invoice_id;

  for line_item in
    select item.value
    from pg_catalog.jsonb_array_elements(resolved_items) with ordinality
      as item(value, position)
    order by item.position
  loop
    line_product_id := (line_item->>'productId')::uuid;
    qty := (line_item->>'quantity')::numeric;

    select
      product.id,
      product.track_stock,
      product.fulfillment_method
    into product_record
    from public.products product
    where product.id = line_product_id
      and product.business_id = target_business_id;

    select
      structure.id,
      structure.output_quantity,
      structure.yield_percent
    into structure_record
    from public.product_structures structure
    where structure.business_id = target_business_id
      and structure.parent_product_id = line_product_id
      and structure.is_active = true
    order by structure.updated_at desc
    limit 1;

    if structure_record.id is not null
      and product_record.fulfillment_method = 'recipe_on_sale'
    then
      for structure_line in
        select
          line.component_product_id,
          line.quantity,
          line.waste_percent
        from public.product_structure_lines line
        where line.business_id = target_business_id
          and line.structure_id = structure_record.id
      loop
        select product.id, product.track_stock
        into component_record
        from public.products product
        where product.id = structure_line.component_product_id
          and product.business_id = target_business_id;

        if component_record.track_stock then
          component_required := qty * structure_line.quantity
            * (1 + structure_line.waste_percent / 100)
            / greatest(structure_record.output_quantity, 1)
            / (greatest(structure_record.yield_percent, 1) / 100);
          component_unit_cost := public.product_unit_cost(
            target_business_id,
            component_record.id
          );

          insert into public.stock_movements (
            business_id,
            item_id,
            warehouse_id,
            date,
            type,
            quantity,
            value,
            journal_entry_id,
            memo
          ) values (
            target_business_id,
            component_record.id,
            location_record.warehouse_id,
            sale_date,
            'sale',
            component_required,
            component_required * component_unit_cost,
            sales_journal_id,
            invoice_no
          );
        end if;
      end loop;
    elsif product_record.track_stock then
      unit_cogs := (line_item->>'unitCogs')::numeric;

      insert into public.stock_movements (
        business_id,
        item_id,
        warehouse_id,
        date,
        type,
        quantity,
        value,
        journal_entry_id,
        memo
      ) values (
        target_business_id,
        line_product_id,
        location_record.warehouse_id,
        sale_date,
        'sale',
        qty,
        qty * unit_cogs,
        sales_journal_id,
        invoice_no
      );
    end if;
  end loop;

  payment_no := public.next_document_no(target_business_id, 'RCV');

  insert into public.payments (
    business_id,
    direction,
    document_type,
    document_id,
    date,
    amount,
    method,
    reference,
    status,
    created_by
  ) values (
    target_business_id,
    'inbound',
    'sales_invoice',
    invoice_id,
    sale_date,
    total,
    payment_method_value,
    payment_no,
    'posted',
    auth.uid()
  )
  returning id into payment_id;

  payment_journal_id := public.create_posted_journal(
    target_business_id,
    sale_date,
    'Penerimaan POS ' || payment_no,
    'manual_transaction',
    payment_id,
    member_role,
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'accountCode', '1000', 'debit', total, 'credit', 0, 'memo', payment_no
      ),
      pg_catalog.jsonb_build_object(
        'accountCode', '1100', 'debit', 0, 'credit', total, 'memo', payment_no
      )
    )
  );

  update public.payments
  set journal_entry_id = payment_journal_id
  where id = payment_id;

  insert into public.payment_allocations (
    business_id,
    payment_id,
    document_type,
    document_id,
    amount
  ) values (
    target_business_id,
    payment_id,
    'sales_invoice',
    invoice_id,
    total
  );

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
    coalesce(auth.uid()::text, 'Kasir'),
    'sales',
    'posted POS sale',
    invoice_no || ' dipost dari cabang.'
  );

  return invoice_id;
end;
$$;

alter function public.post_pos_sale_internal(jsonb) owner to postgres;

comment on function public.post_pos_sale_internal(jsonb) is
  'Internal POS posting command. Resolves each positive price from the locked same-tenant product catalog and ignores caller-provided prices.';

revoke all on function public.post_pos_sale_internal(jsonb)
  from public, anon, authenticated, service_role;

commit;
