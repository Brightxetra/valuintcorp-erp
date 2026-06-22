# Production Ops Checklist

## Deployment

- Apply migrations `001` through `021` in order on a clean Supabase project before enabling production traffic. Migrations `019` and `020` are required before enabling branch POS or per-member menu access; migration `021` is required for idle timeout, remembered sessions, and Settings > Security device logout.
- Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_DEMO_MODE=false`, `NEXT_PUBLIC_DEMO_LOGIN_ENABLED=true`, `SUPABASE_ERP_ATTACHMENTS_BUCKET=erp-attachments`, and `CRON_SECRET`.
- Enable Supabase Auth leaked password protection before accepting production sign-ups.
- Confirm `/login` creates a Supabase browser session and `/api/auth/session` writes the server session cookie.
- Confirm `src/proxy.ts` redirects protected routes to `/login?next=...` when the cookie is missing.
- Create a tenant from `/onboarding`, apply an industry template, create one location, and verify `/api/erp/workspace` does not include unbounded raw transaction rows.
- Run `npm run seed:demo-accounts`, then verify a demo account login creates a `demo_sandboxes` tenant and normal user login still uses production onboarding.
- Confirm Vercel Cron calls `/api/ops/demo-reset` with `CRON_SECRET` and only demo sandbox tenants are reset.
- Run `npm run verify:deploy`; use `VERIFY_DEPLOY_STRICT=true npm run verify:deploy` in CI/deploy gates.

## Backup And Restore

- Enable Supabase daily backups before pilot data starts.
- Run one manual backup before the first UAT cycle.
- Restore the latest backup into a staging project monthly and verify login, workspace load, reports, and attachment metadata.
- Keep a restore runbook with project id, migration version, backup timestamp, restore target, and verification owner.

## Monitoring

- Capture structured JSON logs from API runtime and alert on these event patterns:
  - `erp.import.commit.failed`
  - `erp.import.commit.no_valid_rows`
  - `erp.attachment.signed_upload.failed`
  - `erp.attachment.metadata.failed`
  - `erp.member.invite.failed`
- Alert on repeated 4xx/5xx from `/api/demo/bootstrap` and `/api/ops/demo-reset`.
- Track response time and error rate for `/api/erp/workspace`, `/api/erp/imports/commit`, `/api/erp/summaries/post`, `/api/erp/reconciliation`, and `/api/exports/financials`.
- Track workspace response size; raw transactions should only be fetched from paginated raw endpoints.
- Review Supabase Query Performance Statements after real production usage; do not add indexes for Supabase dashboard/internal statements. Current baseline is in `docs/supabase-query-performance.md`.

## Performance Benchmark

- Run local aggregation smoke tests with `npm run benchmark:raw -- 10000`, `npm run benchmark:raw -- 100000`, and `npm run benchmark:raw -- 1000000`.
- Seed raw transactions at 10k, 100k, and 1M rows in staging by business, location, source, and date.
- Dashboard and workspace checks must read daily summaries, not scan raw rows.
- Summary posting should create journal entries per location/source/day, not per receipt.
- Reconciliation must compare raw total, summary total, settlement total, and journal total for the filtered period.
- Escalate to partitioning/read replicas/background workers when summary queries or posting jobs exceed pilot SLOs.
- Consider a new performance migration only when app queries show `mean_time > 100 ms`, high `rows_read`, low cache hit rate, rising `total_time`, or a non-null Supabase index advisor recommendation.

## Pilot Seed Data

- Prepare one seed business for each template: jasa, retail, F&B ringan, online seller, and distributor kecil.
- Each seed business must include owner, finance/admin, staff, external advisor, one active period, tax profile, COA, one location, and one transaction source.
- Retail/F&B/online seller seeds must include stock items, non-stock/service items, one import batch, one daily summary, one posted journal, and one reconciliation check.
- Hosted sales/demo accounts should be seeded through `demo_user_accounts`, not by setting `NEXT_PUBLIC_DEMO_MODE=true` in production.
