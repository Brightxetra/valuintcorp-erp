# Supabase Query Performance Review

Source snapshot: `Supabase Query Performance Statements (sxhbjwuurkwrnjmnpnix).csv`, reviewed 2026-06-12.

## Current Findings

- The export contains 20 statements with about 47.5 seconds of captured total time.
- About 99% of captured time is from Supabase internal/dashboard activity such as extension metadata, timezone metadata, schema introspection, and backup/admin statements.
- Application-visible workload is small:
  - `authenticated`: `business_feature_flags` by `business_id`, ordered by `module`; 65 calls, mean about 5 ms, 100% cache hit.
  - `service_role`: `reset_due_demo_sandboxes()` cron RPC; 4 calls, mean about 36 ms, 100% cache hit.
- Supabase index advisor did not return any index recommendation.

## Decision

Do not add a performance migration or new index from this snapshot.

The two application queries already match existing indexes:

- `feature_flags_business_module_idx` on `business_feature_flags (business_id, module)`
- `demo_sandboxes_next_reset_idx` on `demo_sandboxes (reset_policy, next_reset_at)` for daily demo reset scans

Internal Supabase dashboard/admin statements should not drive application schema changes.

## Recheck Triggers

Export and review Supabase Query Performance Statements again after meaningful production usage, especially after these flows have real data:

- onboarding a business
- loading `/api/erp/workspace`
- creating invoice, bill, payment, payroll, and fixed asset documents
- importing CSV raw transactions
- opening reconciliation and daily summary views

Open a performance migration only when an application query shows at least one of:

- `mean_time > 100 ms`
- large or rising `total_time`
- high `rows_read` relative to result size
- low cache hit rate
- non-null `index_advisor_result`

Priority endpoints to inspect first: `/api/erp/workspace`, `/api/erp/raw-transactions`, `/api/erp/daily-summaries`, `/api/erp/reconciliation`, and `/api/erp/imports/commit`.
