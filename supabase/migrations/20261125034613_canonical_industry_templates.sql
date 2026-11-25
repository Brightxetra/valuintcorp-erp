begin;

alter table public.businesses
  drop constraint if exists businesses_industry_check;

alter table public.businesses
  add constraint businesses_industry_check
  check (industry in ('umkm', 'general', 'service', 'retail', 'food_beverage', 'online_seller', 'manufacturing'));

insert into public.industry_templates (
  id,
  industry,
  name,
  description,
  enabled_modules,
  default_product_type
)
values
  (
    'umkm',
    'umkm',
    'UMKM',
    'Alur sederhana untuk penjualan, pembelian, stok, kas, laporan, SDM, payroll, dan pajak dasar.',
    array['dashboard', 'sales', 'purchases', 'inventory', 'accounting', 'reports', 'hr', 'payroll', 'tax'],
    'stock_item'
  ),
  (
    'general',
    'general',
    'General',
    'Alur lengkap untuk bahan mentah, barang jadi, BOM, produksi, costing, multi-cabang, impor, dan konsolidasi.',
    array['dashboard', 'sales', 'purchases', 'inventory', 'accounting', 'reports', 'hr', 'payroll', 'imports', 'locations', 'tax'],
    'stock_item'
  )
on conflict (id) do update set
  industry = excluded.industry,
  name = excluded.name,
  description = excluded.description,
  enabled_modules = excluded.enabled_modules,
  default_product_type = excluded.default_product_type;

update public.industry_templates
set description = 'Legacy template. Bisnis baru harus memakai UMKM atau General.'
where id not in ('umkm', 'general');

update public.demo_sandboxes
set template_id = case
  when template_id in ('umkm', 'food_beverage', 'online_seller', 'tpl-food-beverage-recipe') then 'umkm'
  else 'general'
end
where template_id is not null;

update public.demo_user_accounts
set template_id = case
  when template_id in ('umkm', 'food_beverage', 'online_seller', 'tpl-food-beverage-recipe') then 'umkm'
  else 'general'
end
where template_id is not null;

create or replace function public.apply_industry_template_internal(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_business_id uuid := (payload->>'businessId')::uuid;
  requested_template_id text := payload->>'templateId';
  target_template_id text;
  template_record record;
  enabled_module text;
  default_warehouse uuid;
begin
  if requested_template_id is null or requested_template_id not in (
    'umkm', 'general', 'service', 'retail', 'food_beverage', 'online_seller', 'manufacturing', 'distributor',
    'tpl-manufacturing', 'tpl-food-beverage-recipe'
  ) then
    raise exception 'Industry template % does not exist.', requested_template_id;
  end if;

  target_template_id := case
    when requested_template_id in ('umkm', 'food_beverage', 'online_seller', 'tpl-food-beverage-recipe') then 'umkm'
    else 'general'
  end;

  perform public.require_posting_role(target_business_id, array['owner', 'finance_admin', 'system_admin']);

  select * into template_record
  from public.industry_templates
  where id = target_template_id;

  if template_record.id is null then
    raise exception 'Industry template % does not exist.', target_template_id;
  end if;

  update public.businesses
  set industry = target_template_id
  where id = target_business_id;

  delete from public.business_feature_flags where business_id = target_business_id;

  foreach enabled_module in array template_record.enabled_modules
  loop
    insert into public.business_feature_flags (business_id, module, enabled)
    values (target_business_id, enabled_module, true)
    on conflict (business_id, module) do update set enabled = true;
  end loop;

  select id into default_warehouse
  from public.warehouses
  where business_id = target_business_id and is_active = true
  order by code
  limit 1;

  if default_warehouse is not null and not exists (select 1 from public.locations where business_id = target_business_id) then
    insert into public.locations (business_id, code, name, type, warehouse_id)
    values (target_business_id, 'LOC-001', 'Lokasi Utama', 'branch', default_warehouse);
  end if;

  insert into public.activity_events (business_id, actor_user_id, actor_name, module, action, description)
  values (
    target_business_id,
    auth.uid(),
    coalesce(auth.uid()::text, 'System'),
    'accounting',
    'template applied',
    'Template ' || target_template_id || ' was applied.'
  );

  return target_business_id;
end;
$$;

revoke all on function public.apply_industry_template_internal(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.apply_industry_template_internal(jsonb) to service_role;

commit;
