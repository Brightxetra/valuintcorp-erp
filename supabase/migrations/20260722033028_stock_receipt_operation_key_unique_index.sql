create unique index concurrently stock_movements_business_operation_key_uidx
  on public.stock_movements (business_id, operation_key)
  where operation_key is not null;
