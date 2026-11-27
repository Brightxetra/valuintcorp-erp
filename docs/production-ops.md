# Production Ops Checklist

## Deployment

- Apply migrations `001` through `027`, followed by `20260705004700_auth_security_events_and_counterparty_tax_ids.sql`, `20260719072824_harden_public_api_privileges.sql`, `20260719081805_stock_receipt_service_rpc.sql`, `20260722033028_stock_receipt_operation_key_unique_index.sql`, `20260722033031_activate_stock_receipt_service_rpc.sql`, `20260723071330_harden_inventory_mutation_locking.sql`, `20260723071331_validate_stock_movement_operation_identity.sql`, and `20260821070246_harden_member_invite_authority.sql`, in order on a clean Supabase project before enabling production traffic. Verify the live migration history separately; repository files are not proof that production is current. On an existing project, rehearse the ACL, inventory, and member-invite migrations on an explicitly approved, isolated PostgreSQL 17 target before cutover; do not replay missing migrations or use `db push --include-all` to repair history.
- The ACL migration preserves the repository-required Data API allowlist while intentionally removing unused writes from four read-only compatibility tables and retaining only `SELECT, INSERT` on `activity_events`. It also removes `TRUNCATE`, `REFERENCES`, `TRIGGER`, and `MAINTAIN` from `PUBLIC`, `anon`, and `authenticated` on all current public tables. Inventory external direct PostgREST/GraphQL consumers before cutover; repository reachability alone is not proof of compatibility.
- Run `supabase test db supabase/tests/public_api_privileges.test.sql` against an isolated PostgreSQL 17 rehearsal database after applying the full migration chain. Require the effective privilege assertions and scratch-object default-ACL probes to pass. Capture the effective `service_role` matrix before and after rehearsal and require exact equality, because environments with privileges inherited only through `PUBLIC` can differ from the verified production baseline. RLS does not protect whole-table operations such as `TRUNCATE` or `REFERENCES`.
- Run `supabase test db supabase/tests/stock_receipt_service_rpc.test.sql`, `supabase test db supabase/tests/inventory_mutation_hardening.test.sql`, and `supabase test db supabase/tests/member_invite_authority.test.sql` on the same approved isolated PostgreSQL 17 target. The member-invite rehearsal must prove that a default finance administrator cannot create an owner/system-admin invite, a stale inviter cannot be accepted, direct DML cannot mark an invite accepted, and one legitimate invite produces exactly one bounded membership. Then run separately reviewed concurrency rehearsals against that target: identical concurrent requests must yield one `created`, one `replayed`, and one movement/activity pair; conflicting payloads sharing a key must yield one success and one conflict. Submit two equivalent multi-item POS payloads in opposite item order and require both to complete without `40P01`. Also exercise three sessions where POS holds an item lock, another stock write waits while holding the shared global gate, and period close must fail quickly with `55P03` (then succeed after postings finish) instead of deadlocking. A single-session pgTAP run, static advisory-lock assertion, Vercel Preview, or production database is not concurrency proof.
- The operation-key unique index is intentionally a standalone `CREATE UNIQUE INDEX CONCURRENTLY` migration so it does not block normal writes. Run it only with Supabase CLI `>= 2.109.0`, which supports pipeline-incompatible migration statements, or through a separately reviewed operator path. It has no `IF NOT EXISTS`: a failed concurrent build can leave an invalid index and must stop activation. Inspect `pg_index.indisvalid` and `indisready`; if the named index is invalid, use a separately reviewed non-transactional `DROP INDEX CONCURRENTLY`, confirm it is absent, and retry only the still-unrecorded index migration. Never drop a valid live index as a retry shortcut. The following activation migration verifies the identity columns/constraint plus index readiness, validity, uniqueness, keys, and predicate before exposing the service RPC.
- Treat the stock-receipt migration as expand/app only. It protects non-null command keys while preserving legacy `NULL`-key DML and makes both command and legacy movement writes take a shared global ordering lock before their business posting-period lock. Period DML uses a non-queuing exclusive global try-lock and returns `55P03` when postings are in flight; operators/users must retry rather than letting a queued close invert older POS/item-lock workflows. This preserves current no-journal accounting behavior. Legacy direct DML still lacks command idempotency and the paired activity event, so do not treat expand/app as the final cutover: revoke authenticated stock-movement DML only after the compatible application has been rehearsed and observed. The future inventory-receipt/GRNI document and explicit unjournaled-receipt reconciliation signal remain separate release gates.
- The inventory hardening migration pre-locks every POS parent and active recipe component key in UUID order before calling the unchanged posting implementation. Only the actor-bound `post_pos_sale` wrapper remains callable by `service_role`; direct execution of `post_pos_sale_internal` is revoked so callers cannot bypass canonical locking. Its stock-movement trigger locks distinct `OLD`/`NEW` balance keys in `(business_id, item_id, warehouse_id)` order and evaluates the projected quantity and value, closing the legacy UPDATE bypass without rewriting historical rows. The following migration validates `stock_movements_operation_identity_pair_chk`; stop if validation cannot acquire its bounded lock or finds a violating legacy row.
- The role-wide future-function default revoke applies to every schema for routines subsequently created by `postgres`, not only `public`. Every later routine migration must grant `EXECUTE` explicitly to its intended callers. Supabase-managed `supabase_admin` defaults remain a separate platform/operator gate.
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
- Track response time and error rate for `/api/erp/workspace`, `/api/erp/stock-receipts`, `/api/erp/imports/commit`, `/api/erp/summaries/post`, `/api/erp/reconciliation`, and `/api/exports/financials`; alert separately on stock-receipt `409` conflicts and repeated ambiguous client retries.
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
