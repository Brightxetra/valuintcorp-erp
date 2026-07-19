# Valuintcorp ERP

Custom ERP web mobile-first untuk UMKM: penjualan, pembelian, stok multi-gudang, akuntansi double-entry tersembunyi, laporan SAK EMKM, HR/payroll, dan paket persiapan Coretax.

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Scripts

```bash
npm run lint
npm run test
npm run build
npm run benchmark:raw -- 100000
```

## Implemented Foundation

- Next.js 16 + TypeScript + Tailwind UI.
- PWA manifest and service worker.
- ERP workspace shell with desktop sidebar, mobile bottom nav, business/period controls, global search, quick create, task and activity surfaces.
- Working module routes: `/dashboard`, `/sales`, `/purchases`, `/inventory`, `/accounting`, `/reports`, `/hr`, `/tax`, `/settings`, `/onboarding`, and `/login`.
- Document-first workflows for sales invoices, purchase bills, payment receipts, stock adjustments, payroll runs, AR/AP, stock cards, and tax prep.
- Production workspace provider with server-side session bootstrap, active business context, bearer-token API calls, route guard through `src/proxy.ts`, and explicit demo fallback.
- Master-data CRUD for customers, suppliers, products, warehouses, employees, business profile, tax profile, email-based pending member invites, and direct member upsert when a Supabase auth user id already exists.
- Workflow APIs for stock transfers, period lock, document void/reversal, CSV raw import preview/commit/validate/summarize/post/rollback, paginated raw transaction detail, reconciliation report, signed attachment upload, and attachment metadata.
- Accounting engine with balanced journals, opening balance, sales, expenses, inventory, payroll, reversal, and period lock guards.
- SAK EMKM-style report builders and Coretax preparation package.
- XLSX/PDF export endpoint at `/api/exports/financials`.
- Journal preview endpoint at `/api/journals/preview`.
- ERP CRUD endpoints under `/api/erp/*` with demo fallback and Supabase-ready persistence paths.
- API authorization guard for demo mode and Supabase-backed mode.
- Supabase-backed demo accounts with per-user sandbox tenants, daily reset RPC, seed script, and Vercel Cron endpoint.
- Service worker excludes API responses from offline cache.
- Supabase migrations with multi-tenant tables, ERP document tables, location/template/raw transaction scale layer, pending invites, source mappings, Storage bucket policies, role-based RLS policies, audit triggers, journal balance checks, stock/payroll integrity triggers, and owner bootstrap RPC.
- Structured JSON logs for import, posting-adjacent attachment, and admin invite failures.
- Vitest coverage for accounting, reporting, ERP operations, API permissions, CSV raw import preview, migration contract, payroll, and inventory valuation.

## Supabase

Copy `.env.example` to `.env.local` for local development. Demo fallback is opt-in through `NEXT_PUBLIC_DEMO_MODE=true`; missing Supabase variables alone fail closed and never create a synthetic demo owner. Production and self-hosted `NODE_ENV=production` builds/starts enforce the complete configuration because public browser variables are frozen at build time. A trusted Vercel preview (`VERCEL=1` plus `VERCEL_ENV=preview`) runs a marker/key safety gate without requiring production-only secrets. The Playwright production-build harness is the sole non-Vercel exception and requires explicit demo mode plus matching public and private E2E markers. Hosted/public demos use normal Supabase Auth accounts.

Apply migrations in order:

```text
supabase/migrations/001_initial_schema.sql
supabase/migrations/002_security_and_integrity_hardening.sql
supabase/migrations/003_erp_core_tables.sql
supabase/migrations/004_erp_production_hardening.sql
supabase/migrations/005_erp_workspace_bootstrap_and_workflows.sql
supabase/migrations/006_horizontal_erp_scale_layer.sql
supabase/migrations/007_production_ops_and_storage.sql
supabase/migrations/008_demo_sandbox_and_deploy_readiness.sql
supabase/migrations/009_business_logo_profile.sql
supabase/migrations/010_fixed_assets.sql
supabase/migrations/011_authenticated_api_privileges.sql
supabase/migrations/012_harden_supabase_security_lints.sql
supabase/migrations/013_optimize_rls_policy_performance.sql
supabase/migrations/014_private_authz_helpers.sql
supabase/migrations/015_add_foreign_key_performance_indexes.sql
supabase/migrations/016_reconciliation_rollup_rpc.sql
supabase/migrations/017_workspace_route_performance.sql
supabase/migrations/018_lockdown_security_definer_rpcs.sql
supabase/migrations/019_branch_pos_and_member_access.sql
supabase/migrations/020_api_role_table_privileges.sql
supabase/migrations/021_user_login_sessions.sql
supabase/migrations/022_employee_profiles_and_bpjs_policy.sql
supabase/migrations/023_fix_post_hardening_rls_policies.sql
supabase/migrations/024_supabase_advisor_rls_and_pos_trigger_hardening.sql
supabase/migrations/025_industry_catalog_recipes_mrp.sql
supabase/migrations/026_fix_document_sequence_key_ambiguity.sql
supabase/migrations/027_prevent_negative_inventory_stock.sql
supabase/migrations/20260705004700_auth_security_events_and_counterparty_tax_ids.sql
```

Required env vars for Supabase-backed API authorization:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_PROJECT_REF=
NEXT_PUBLIC_HCAPTCHA_SITE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ERP_ATTACHMENTS_BUCKET=erp-attachments
CRON_SECRET=
NEXT_PUBLIC_DEMO_MODE=false
NEXT_PUBLIC_DEMO_LOGIN_ENABLED=true
```

`NEXT_PUBLIC_SUPABASE_ANON_KEY` accepts the preferred publishable key or a legacy anon key. `SUPABASE_SERVICE_ROLE_KEY` accepts a backend-only secret key or legacy service-role key and must never use a `NEXT_PUBLIC_` name. `SUPABASE_PROJECT_REF` pins privileged clients and checks to `https://<project-ref>.supabase.co` while still allowing a configured custom domain for public traffic. `NEXT_PUBLIC_HCAPTCHA_SITE_KEY` is the public hCaptcha site key used by the login/register form. Keep the hCaptcha secret only in Supabase Auth Attack Protection, not in this app's env vars.

Create a tenant from `/onboarding` after the authenticated owner signs in, or call `create_business_with_owner(legal_name, display_name, industry, owner_name, tax_id)`. Migration 005 seeds the owner role, chart of accounts, current report period, tax profile, default warehouse, and bootstrap activity. Migration 006 adds horizontal UMKM scale primitives: locations, industry templates, feature flags, transaction sources, raw transactions, settlement records, and daily summaries. Migration 007 adds pending invites, source mappings, tenant-isolated Storage policies, and attachment owner validation. Browser UI API calls attach both `Authorization: Bearer <access_token>` and `x-business-id: <business_uuid>` through the ERP provider, while `/api/auth/session` mirrors the access token into a short-lived server cookie for guarded initial renders.

High-volume import defaults to CSV raw ingestion:

```text
POST /api/erp/imports/preview
POST /api/erp/imports/commit
GET  /api/erp/raw-transactions?locationId=&source=&dateFrom=&dateTo=&status=&page=
GET  /api/erp/daily-summaries?locationId=&source=&dateFrom=&dateTo=&status=&page=
GET  /api/erp/reconciliation?locationId=&source=&dateFrom=&dateTo=
```

Large dashboards and workspaces must read bounded documents, daily summaries, and paginated raw detail. Do not add unbounded raw transaction arrays to `/api/erp/workspace`.

Production readiness checklists are in `docs/production-ops.md`; pilot UAT scenarios are in `docs/pilot-uat.md`.

## Demo Accounts for Hosted Demo

Hosted/public demos should use Supabase Auth accounts, not `NEXT_PUBLIC_DEMO_MODE=true`.

```powershell
$env:DEMO_ACCOUNT_PASSWORD = '<set-an-explicit-seed-only-secret>'
npm.cmd run seed:demo-accounts
```

Default seeded accounts:

```text
demo.owner@valuintcorp.test
demo.finance@valuintcorp.test
demo.staff@valuintcorp.test
```

`DEMO_ACCOUNT_PASSWORD` is mandatory, has no default, and is never printed by the seed script. Store it only in the seed operator's secret environment; it is not a production runtime requirement.

When a seeded demo user logs in, `/api/demo/bootstrap` creates or reuses a dedicated sandbox tenant, marks it in `demo_sandboxes`, and keeps all normal API/RLS behavior active. `/api/ops/demo-reset` resets due demo sandboxes through service-role RPC only after validating `CRON_SECRET`; `vercel.json` schedules this daily at midnight Jakarta time.

Run deploy checks before hosting:

```bash
npm run verify:deploy
npm run verify:deploy:live
```

`verify:deploy` is strict by default and reads only the process environment. `verify:deploy:live` validates the frontend API key against both the configured Supabase origin and the canonical `SUPABASE_PROJECT_REF`, then performs a bounded privileged reachability check only through the canonical project origin across identity, sales, purchasing, inventory, accounting, reporting/tax, raw-data, attachment, fixed-asset, branch, and session tables. Migration history, effective grants/RLS, RPCs, triggers, and Storage policies remain separate release gates. For local diagnostics that may load `.env.local`, use `npm run verify:deploy:local`; that profile is rejected in CI and production runtimes.
