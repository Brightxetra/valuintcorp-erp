-- Track application-level login sessions for idle timeout, remembered devices,
-- and user-managed force logout from Settings > Security.

create table if not exists public.user_login_sessions (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null,
  session_token_hash text not null unique,
  remember_me boolean not null default false,
  device_label text not null default 'Perangkat tidak dikenal',
  user_agent text,
  ip_address inet,
  location text,
  status text not null default 'active' check (status in ('active', 'revoked', 'expired')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid,
  revoked_reason text
);

create index if not exists user_login_sessions_auth_user_idx
  on public.user_login_sessions (auth_user_id, last_seen_at desc);

create index if not exists user_login_sessions_active_expiry_idx
  on public.user_login_sessions (status, expires_at)
  where status = 'active';

alter table public.user_login_sessions enable row level security;

drop policy if exists "users can read own login sessions" on public.user_login_sessions;
create policy "users can read own login sessions"
  on public.user_login_sessions
  for select
  to authenticated
  using ((select auth.uid()) = auth_user_id);

revoke insert, update, delete on public.user_login_sessions from authenticated;
grant select on public.user_login_sessions to authenticated;
grant select, insert, update, delete on public.user_login_sessions to service_role;
