begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Objects created by the application migration role must opt in to the Data API.
alter default privileges for role postgres in schema public
  revoke all privileges on tables
  from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke all privileges on sequences
  from anon, authenticated, service_role;

-- PostgreSQL grants EXECUTE on new functions to PUBLIC globally by default.
-- This role-wide default affects functions postgres creates in every schema;
-- each future routine must grant EXECUTE explicitly to its intended callers.
alter default privileges for role postgres
  revoke execute on functions
  from public;

-- Remove schema-local function defaults previously added for Data API roles.
alter default privileges for role postgres in schema public
  revoke execute on functions
  from public, anon, authenticated, service_role;

-- RLS does not govern whole-table/object operations. Preserve the existing
-- CRUD compatibility matrix while removing privileges the Data API does not use.
revoke truncate, references, trigger, maintain
on all tables in schema public
from public, anon, authenticated;

-- Reset only the first bounded set of current tables. Existing service_role
-- privileges and every repository-required authenticated path remain unchanged.
revoke all privileges on table
  public.audit_logs,
  public.industry_templates,
  public.demo_user_accounts,
  public.demo_sandboxes,
  public.activity_events
from public, anon, authenticated;

grant select on table
  public.audit_logs,
  public.industry_templates,
  public.demo_user_accounts,
  public.demo_sandboxes
to authenticated;

-- Transitional until stock receipt is moved to an actor-bound service RPC.
grant select, insert on table public.activity_events
to authenticated;

commit;
