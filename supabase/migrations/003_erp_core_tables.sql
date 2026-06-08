create table public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  code text not null,
  name text not null,
  phone text,
  email text,
  address text,
  credit_limit numeric(18, 2) not null default 0 check (credit_limit >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, code)
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  code text not null,
  name text not null,
  phone text,
  email text,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, code)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  sku text not null,
  name text not null,
  variant text,
  category text not null default 'Umum',
  unit text not null,
  track_stock boolean not null default true,
  default_warehouse_id uuid references public.warehouses(id),
  selling_price numeric(18, 2) not null default 0 check (selling_price >= 0),
  purchase_price numeric(18, 2) not null default 0 check (purchase_price >= 0),
  reorder_point numeric(18, 4) not null default 0 check (reorder_point >= 0),
  is_sellable boolean not null default true,
  is_purchasable boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, sku)
);

create table public.sales_invoices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  invoice_no text not null,
  customer_id uuid not null references public.customers(id),
  date date not null,
  due_date date not null,
  status text not null default 'draft' check (status in ('draft', 'posted', 'partially_paid', 'paid', 'void')),
  total numeric(18, 2) not null default 0 check (total >= 0),
  paid_amount numeric(18, 2) not null default 0 check (paid_amount >= 0),
  journal_entry_id uuid references public.journal_entries(id),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (date <= due_date),
  check (paid_amount <= total),
  unique (business_id, invoice_no)
);

create table public.sales_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  sales_invoice_id uuid not null references public.sales_invoices(id) on delete cascade,
  product_id uuid not null references public.products(id),
  description text not null,
  quantity numeric(18, 4) not null check (quantity > 0),
  unit_price numeric(18, 2) not null check (unit_price >= 0),
  cogs numeric(18, 2) not null default 0 check (cogs >= 0)
);

create table public.purchase_bills (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  bill_no text not null,
  supplier_id uuid not null references public.suppliers(id),
  date date not null,
  due_date date not null,
  status text not null default 'draft' check (status in ('draft', 'posted', 'partially_paid', 'paid', 'void')),
  total numeric(18, 2) not null default 0 check (total >= 0),
  paid_amount numeric(18, 2) not null default 0 check (paid_amount >= 0),
  journal_entry_id uuid references public.journal_entries(id),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (date <= due_date),
  check (paid_amount <= total),
  unique (business_id, bill_no)
);

create table public.purchase_bill_lines (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  purchase_bill_id uuid not null references public.purchase_bills(id) on delete cascade,
  product_id uuid not null references public.products(id),
  description text not null,
  quantity numeric(18, 4) not null check (quantity > 0),
  unit_cost numeric(18, 2) not null check (unit_cost >= 0)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  document_type text not null check (document_type in ('sales_invoice', 'purchase_bill', 'payroll_run')),
  document_id uuid not null,
  date date not null,
  amount numeric(18, 2) not null check (amount > 0),
  method text not null check (method in ('cash', 'bank_transfer', 'qris', 'marketplace', 'other')),
  reference text not null,
  status text not null default 'posted' check (status in ('posted', 'void')),
  journal_entry_id uuid references public.journal_entries(id),
  created_by uuid,
  created_at timestamptz not null default now()
);

create table public.stock_transfers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  transfer_no text not null,
  date date not null,
  item_id uuid not null references public.products(id),
  from_warehouse_id uuid not null references public.warehouses(id),
  to_warehouse_id uuid not null references public.warehouses(id),
  quantity numeric(18, 4) not null check (quantity > 0),
  status text not null default 'draft' check (status in ('draft', 'posted', 'void')),
  memo text,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (business_id, transfer_no),
  check (from_warehouse_id <> to_warehouse_id)
);

create table public.stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  adjustment_no text not null,
  date date not null,
  item_id uuid not null references public.products(id),
  warehouse_id uuid not null references public.warehouses(id),
  quantity numeric(18, 4) not null check (quantity <> 0),
  value numeric(18, 2) not null default 0 check (value >= 0),
  reason text not null,
  status text not null default 'posted' check (status in ('posted', 'void')),
  journal_entry_id uuid references public.journal_entries(id),
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (business_id, adjustment_no)
);

create table public.stock_opnames (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  opname_no text not null,
  warehouse_id uuid not null references public.warehouses(id),
  date date not null,
  status text not null default 'draft' check (status in ('draft', 'posted', 'void')),
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (business_id, opname_no)
);

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  source text not null check (source in ('bank_csv', 'pos_csv', 'marketplace_csv')),
  status text not null default 'preview' check (status in ('preview', 'committed', 'rolled_back')),
  total_rows int not null default 0 check (total_rows >= 0),
  valid_rows int not null default 0 check (valid_rows >= 0),
  duplicate_rows int not null default 0 check (duplicate_rows >= 0),
  error_rows int not null default 0 check (error_rows >= 0),
  created_by uuid,
  created_at timestamptz not null default now()
);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  owner_type text not null check (owner_type in ('sales_invoice', 'purchase_bill', 'payment', 'payroll_run')),
  owner_id uuid not null,
  file_name text not null,
  storage_path text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  created_by uuid,
  created_at timestamptz not null default now()
);

create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  actor_user_id uuid,
  actor_name text not null,
  module text not null check (module in ('sales', 'purchases', 'inventory', 'hr', 'tax', 'accounting')),
  action text not null,
  description text not null,
  created_at timestamptz not null default now()
);

alter table public.customers enable row level security;
alter table public.suppliers enable row level security;
alter table public.products enable row level security;
alter table public.sales_invoices enable row level security;
alter table public.sales_invoice_lines enable row level security;
alter table public.purchase_bills enable row level security;
alter table public.purchase_bill_lines enable row level security;
alter table public.payments enable row level security;
alter table public.stock_transfers enable row level security;
alter table public.stock_adjustments enable row level security;
alter table public.stock_opnames enable row level security;
alter table public.import_batches enable row level security;
alter table public.attachments enable row level security;
alter table public.activity_events enable row level security;

create policy "members can read customers" on public.customers for select using (public.is_business_member(business_id));
create policy "finance can manage customers" on public.customers for all using (public.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'system_admin'])) with check (public.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'system_admin']));

create policy "members can read suppliers" on public.suppliers for select using (public.is_business_member(business_id));
create policy "finance can manage suppliers" on public.suppliers for all using (public.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'system_admin'])) with check (public.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'system_admin']));

create policy "members can read products" on public.products for select using (public.is_business_member(business_id));
create policy "inventory can manage products" on public.products for all using (public.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'system_admin'])) with check (public.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'system_admin']));

create policy "members can read sales invoices" on public.sales_invoices for select using (public.is_business_member(business_id));
create policy "sales roles can manage sales invoices" on public.sales_invoices for all using (public.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'system_admin'])) with check (public.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'system_admin']));
create policy "members can read sales invoice lines" on public.sales_invoice_lines for select using (public.is_business_member(business_id));
create policy "sales roles can manage sales invoice lines" on public.sales_invoice_lines for all using (public.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'system_admin'])) with check (public.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'system_admin']));

create policy "members can read purchase bills" on public.purchase_bills for select using (public.is_business_member(business_id));
create policy "purchase roles can manage purchase bills" on public.purchase_bills for all using (public.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'system_admin'])) with check (public.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'system_admin']));
create policy "members can read purchase bill lines" on public.purchase_bill_lines for select using (public.is_business_member(business_id));
create policy "purchase roles can manage purchase bill lines" on public.purchase_bill_lines for all using (public.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'system_admin'])) with check (public.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'system_admin']));

create policy "members can read payments" on public.payments for select using (public.is_business_member(business_id));
create policy "finance can manage payments" on public.payments for all using (public.has_business_role(business_id, array['owner', 'finance_admin', 'system_admin'])) with check (public.has_business_role(business_id, array['owner', 'finance_admin', 'system_admin']));

create policy "members can read stock transfers" on public.stock_transfers for select using (public.is_business_member(business_id));
create policy "inventory can manage stock transfers" on public.stock_transfers for all using (public.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'system_admin'])) with check (public.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'system_admin']));
create policy "members can read stock adjustments" on public.stock_adjustments for select using (public.is_business_member(business_id));
create policy "inventory can manage stock adjustments" on public.stock_adjustments for all using (public.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'system_admin'])) with check (public.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'system_admin']));
create policy "members can read stock opnames" on public.stock_opnames for select using (public.is_business_member(business_id));
create policy "inventory can manage stock opnames" on public.stock_opnames for all using (public.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'system_admin'])) with check (public.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'system_admin']));

create policy "members can read imports" on public.import_batches for select using (public.is_business_member(business_id));
create policy "finance can manage imports" on public.import_batches for all using (public.has_business_role(business_id, array['owner', 'finance_admin', 'system_admin'])) with check (public.has_business_role(business_id, array['owner', 'finance_admin', 'system_admin']));

create policy "members can read attachments" on public.attachments for select using (public.is_business_member(business_id));
create policy "members can manage attachments" on public.attachments for all using (public.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'hr', 'system_admin'])) with check (public.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'hr', 'system_admin']));

create policy "members can read activity" on public.activity_events for select using (public.is_business_member(business_id));
create policy "system roles can write activity" on public.activity_events for insert with check (public.has_business_role(business_id, array['owner', 'finance_admin', 'staff', 'hr', 'system_admin']));

