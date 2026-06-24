-- Resolve Supabase Advisor findings without widening tenant access.
-- A FOR ALL policy also applies to SELECT. Splitting read and write policies
-- removes the duplicate permissive SELECT evaluation while retaining the
-- existing role matrix.

drop policy if exists "hr and finance can read bpjs policies" on public.bpjs_policies;
drop policy if exists "hr can manage bpjs policies" on public.bpjs_policies;

create policy "authorized members can read bpjs policies"
on public.bpjs_policies for select
using (app_private.has_business_role(business_id, array['owner', 'finance_admin', 'hr', 'system_admin']));

create policy "hr can insert bpjs policies"
on public.bpjs_policies for insert
with check (app_private.has_business_role(business_id, array['owner', 'hr', 'system_admin']));

create policy "hr can update bpjs policies"
on public.bpjs_policies for update
using (app_private.has_business_role(business_id, array['owner', 'hr', 'system_admin']))
with check (app_private.has_business_role(business_id, array['owner', 'hr', 'system_admin']));

create policy "hr can delete bpjs policies"
on public.bpjs_policies for delete
using (app_private.has_business_role(business_id, array['owner', 'hr', 'system_admin']));

drop policy if exists "members can read branch expenses" on public.branch_expenses;
drop policy if exists "owners can manage branch expenses" on public.branch_expenses;

create policy "members can read branch expenses"
on public.branch_expenses for select
using (app_private.is_business_member(business_id));

create policy "authorized members can insert branch expenses"
on public.branch_expenses for insert
with check (app_private.has_business_role(business_id, array['owner', 'finance_admin', 'system_admin']));

create policy "authorized members can update branch expenses"
on public.branch_expenses for update
using (app_private.has_business_role(business_id, array['owner', 'finance_admin', 'system_admin']))
with check (app_private.has_business_role(business_id, array['owner', 'finance_admin', 'system_admin']));

create policy "authorized members can delete branch expenses"
on public.branch_expenses for delete
using (app_private.has_business_role(business_id, array['owner', 'finance_admin', 'system_admin']));

-- This function is only invoked by the businesses insert trigger. Keep it out
-- of PostgREST's public RPC surface and remove all direct execute grants.
alter function public.ensure_pos_walk_in_customer() set schema app_private;
revoke all on function app_private.ensure_pos_walk_in_customer() from public;
