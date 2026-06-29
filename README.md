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

Copy `.env.example` to `.env.local` for local work. If Supabase variables are empty, API routes run in explicit demo mode and use the `x-demo-role` request header for permission tests.

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
```

Required env vars for Supabase-backed API authorization:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_HCAPTCHA_SITE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ERP_ATTACHMENTS_BUCKET=erp-attachments
CRON_SECRET=
NEXT_PUBLIC_DEMO_MODE=false
NEXT_PUBLIC_DEMO_LOGIN_ENABLED=true
```

`NEXT_PUBLIC_HCAPTCHA_SITE_KEY` is the public hCaptcha site key used by the login/register form. Keep the hCaptcha secret only in Supabase Auth Attack Protection, not in this app's env vars.

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

```bash
npm run seed:demo-accounts
```

Default seeded accounts:

```text
demo.owner@valuintcorp.test
demo.finance@valuintcorp.test
demo.staff@valuintcorp.test
```

Default password is `password-demo`; override with `DEMO_ACCOUNT_PASSWORD`.

When a seeded demo user logs in, `/api/demo/bootstrap` creates or reuses a dedicated sandbox tenant, marks it in `demo_sandboxes`, and keeps all normal API/RLS behavior active. `/api/ops/demo-reset` resets due demo sandboxes through service-role RPC only after validating `CRON_SECRET`; `vercel.json` schedules this daily at midnight Jakarta time.

Run deploy checks before hosting:

```bash
npm run verify:deploy
VERIFY_DEPLOY_STRICT=true npm run verify:deploy
```
