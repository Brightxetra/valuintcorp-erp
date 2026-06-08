-- Allow logged-in Supabase users to reach the public-schema API surface.
-- Row Level Security policies still decide which rows and operations are allowed.

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
