-- Migrations 019 and 022 were authored after the public authorization helpers
-- were intentionally revoked for authenticated users in migration 014. Repair
-- existing databases and keep RLS evaluation on the private helper surface.

alter policy "members can read branch expenses"
on public.branch_expenses
using (app_private.is_business_member(business_id));

alter policy "owners can manage branch expenses"
on public.branch_expenses
using (app_private.has_business_role(business_id, array['owner', 'finance_admin', 'system_admin']))
with check (app_private.has_business_role(business_id, array['owner', 'finance_admin', 'system_admin']));

alter policy "hr and finance can read bpjs policies"
on public.bpjs_policies
using (app_private.has_business_role(business_id, array['owner', 'finance_admin', 'hr', 'system_admin']));

alter policy "hr can manage bpjs policies"
on public.bpjs_policies
using (app_private.has_business_role(business_id, array['owner', 'hr', 'system_admin']))
with check (app_private.has_business_role(business_id, array['owner', 'hr', 'system_admin']));
