-- Ensure PostgREST API roles can use tables created before and after the
-- initial authenticated privilege grant. RLS still controls row-level access;
-- service_role is used only by trusted Next.js server routes.

grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated, service_role;

alter default privileges in schema public
  grant usage, select on sequences to authenticated, service_role;
