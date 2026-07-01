-- Prevent POS, invoice, transfer, and adjustment postings from creating negative stock quantity or value.
-- Existing historical rows are left intact; new outgoing stock movements must be covered by current on-hand quantity and value.

create or replace function public.current_stock_value(
  target_business_id uuid,
  target_item_id uuid,
  target_warehouse_id uuid
)
returns numeric
language sql
stable
set search_path = public
as $$
  select coalesce(sum(
    case
      when type in ('purchase', 'transfer_in', 'adjustment_in') then value
      else -value
    end
  ), 0)
  from public.stock_movements
  where business_id = target_business_id
    and item_id = target_item_id
    and warehouse_id = target_warehouse_id;
$$;

create or replace function public.ensure_stock_movement_consistency()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  item_business uuid;
  warehouse_business uuid;
  available_quantity numeric;
  available_value numeric;
begin
  select business_id into item_business from public.products where id = new.item_id;
  select business_id into warehouse_business from public.warehouses where id = new.warehouse_id;

  if item_business <> new.business_id or warehouse_business <> new.business_id then
    raise exception 'Stock movement item and warehouse must belong to the same business.';
  end if;

  if public.is_period_locked(new.business_id, new.date) then
    raise exception 'Period is locked. Use a correction or reversal entry.';
  end if;

  if tg_op = 'INSERT' and new.type in ('sale', 'transfer_out', 'adjustment_out') then
    perform pg_advisory_xact_lock(hashtext(new.business_id::text || new.item_id::text || new.warehouse_id::text));

    available_quantity := public.current_stock_quantity(new.business_id, new.item_id, new.warehouse_id);
    if available_quantity < new.quantity then
      raise exception 'Stock tidak cukup. Barang habis harus direstock dulu sebelum bisa dijual atau dikurangi.';
    end if;

    available_value := public.current_stock_value(new.business_id, new.item_id, new.warehouse_id);
    if new.value > 0 and available_value + 0.5 < new.value then
      raise exception 'Nilai stok tidak cukup. Restock atau koreksi nilai stok dulu sebelum stok dikurangi.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_locked_stock_movements on public.stock_movements;
create trigger prevent_locked_stock_movements
before insert or update on public.stock_movements
for each row execute function public.ensure_stock_movement_consistency();

revoke execute on function public.current_stock_value(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.current_stock_value(uuid, uuid, uuid) to service_role;

revoke execute on function public.ensure_stock_movement_consistency() from public, anon, authenticated;
grant execute on function public.ensure_stock_movement_consistency() to service_role;
