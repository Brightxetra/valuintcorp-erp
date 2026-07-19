# Production Ops Checklist

## Deployment

- Apply migrations `001` through `028` in order on a clean Supabase project before enabling production traffic. Verify the live migration history separately; repository files are not proof that production is current.
- Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable preferred; legacy anon supported), `SUPABASE_PROJECT_REF`, `NEXT_PUBLIC_HCAPTCHA_SITE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (secret preferred; legacy service-role supported), `NEXT_PUBLIC_DEMO_MODE=false`, `NEXT_PUBLIC_DEMO_LOGIN_ENABLED=true`, `SUPABASE_ERP_ATTACHMENTS_BUCKET=erp-attachments`, and `CRON_SECRET`. Production/self-hosted builds and starts enforce the complete configuration. A trusted Vercel preview (`VERCEL=1` plus `VERCEL_ENV=preview`) uses the reduced marker/key gate; `VALUINTCORP_DEPLOYMENT_ENV=production` remains an optional explicit label that always restores full enforcement.
- Never configure `NEXT_PUBLIC_VALUINTCORP_E2E_MODE` or `VALUINTCORP_E2E_DEMO_MODE` in a deployed environment. They belong only to the Playwright-managed production-build test server, and strict deploy verification rejects them.
- Enable Supabase Auth leaked password protection before accepting production sign-ups.
- Confirm `/login` creates a Supabase browser session and `/api/auth/session` writes the server session cookie.
- Confirm `src/proxy.ts` redirects protected routes to `/login?next=...` when the cookie is missing.
- Create a tenant from `/onboarding`, apply an industry template, create one location, and verify `/api/erp/workspace` does not include unbounded raw transaction rows.
- Set an explicit seed-only `DEMO_ACCOUNT_PASSWORD`, run `npm run seed:demo-accounts`, and verify a demo account login creates a `demo_sandboxes` tenant while normal user login still uses production onboarding. The seed command has no default password, never logs it, and pins privileged traffic to the canonical `SUPABASE_PROJECT_REF` origin.
- Confirm Vercel Cron calls `/api/ops/demo-reset` with `CRON_SECRET` and only demo sandbox tenants are reset.
- Run `npm run verify:deploy` for strict static validation and `npm run verify:deploy:live` before production promotion. The live command proves the configured frontend key/project pairing through Supabase Auth settings and checks a bounded core schema through the privileged key on the canonical project origin. Migration history, effective grants/RLS, RPCs, triggers, and Storage policies remain separate release gates. Use `npm run verify:deploy:local` only for local diagnostics; it is rejected in CI and production runtimes.

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
