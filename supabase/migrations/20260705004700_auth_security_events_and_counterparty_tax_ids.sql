-- Track auth security events for password reset abuse protection without
-- storing raw email addresses, IP addresses, or user agents.

create table if not exists public.auth_security_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (
    event_type in (
      'password_reset_request',
      'password_reset_recovery',
      'password_reset_complete'
    )
  ),
  email_hash text,
  email_domain text,
  ip_hash text not null,
  user_agent_hash text,
  status text not null check (
    status in (
      'sent',
      'captcha_required',
      'cooldown',
      'rate_limited',
      'failed',
      'invalid_callback',
      'limited_attempt',
      'completed'
    )
  ),
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists auth_security_events_email_window_idx
  on public.auth_security_events (event_type, email_hash, created_at desc)
  where email_hash is not null;

create index if not exists auth_security_events_ip_window_idx
  on public.auth_security_events (event_type, ip_hash, created_at desc);

create index if not exists auth_security_events_created_at_idx
  on public.auth_security_events (created_at desc);

alter table public.auth_security_events enable row level security;

revoke all on public.auth_security_events from public, anon, authenticated;
grant select, insert, update, delete on public.auth_security_events to service_role;

alter table public.customers
  add column if not exists tax_id text;

alter table public.suppliers
  add column if not exists tax_id text;

create index if not exists customers_business_tax_id_idx
  on public.customers (business_id, tax_id)
  where tax_id is not null;

create index if not exists suppliers_business_tax_id_idx
  on public.suppliers (business_id, tax_id)
  where tax_id is not null;
