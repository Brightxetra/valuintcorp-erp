-- Bind every application session to exactly one verified Supabase Auth session.
-- Existing unbound sessions are revoked so the rollout fails closed and users
-- authenticate again before receiving a newly bound application session.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '60s';

alter table public.user_login_sessions
  add column if not exists supabase_session_id uuid;

update public.user_login_sessions
set
  status = 'revoked',
  revoked_at = coalesce(revoked_at, now()),
  revoked_reason = coalesce(revoked_reason, 'session_binding_upgrade')
where supabase_session_id is null
  and status = 'active';

-- A synthetic identifier preserves historical rows while making it impossible
-- for a real Supabase session to reuse an unbound legacy application session.
update public.user_login_sessions
set supabase_session_id = gen_random_uuid()
where supabase_session_id is null;

alter table public.user_login_sessions
  alter column supabase_session_id set not null;

create unique index if not exists user_login_sessions_supabase_session_uidx
  on public.user_login_sessions (supabase_session_id);

drop policy if exists "users can read own login sessions"
  on public.user_login_sessions;

revoke all privileges on table public.user_login_sessions
  from public, anon, authenticated;
grant select, insert, update, delete on table public.user_login_sessions
  to service_role;

commit;
