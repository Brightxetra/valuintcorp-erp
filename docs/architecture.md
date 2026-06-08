# Valuintcorp ERP Architecture

## Product Shape

Valuintcorp ERP is a mobile-first SaaS for UMKM operations and bookkeeping. The first production slice focuses on document-first sales, purchases, inventory, hidden double-entry journalization, SAK EMKM-style reports, HR/payroll, and Coretax preparation exports.

## Runtime

- Next.js App Router with TypeScript for UI, API routes, and export endpoints.
- Supabase/PostgreSQL for auth, tenant data, storage references, row-level security, and audit logs.
- Domain logic lives in `src/lib` so accounting/reporting can be tested outside React.
- API routes use a shared permission guard. With Supabase env vars configured, requests require a Supabase bearer token and `x-business-id`. Without env vars or with `NEXT_PUBLIC_DEMO_MODE=true`, routes run in explicit demo mode and use `x-demo-role` for deterministic permission checks.
- Server-rendered app pages use `src/proxy.ts` plus `/api/auth/session` to perform an optimistic server-side guard before the ERP shell renders. API guards remain the authoritative permission boundary.
- ERP module actions live under `/api/erp/*`; local demo fallback returns an updated workspace, while Supabase mode persists document rows and workflow state to tables/RPCs through migrations `003`-`009`.
- Browser screens use a shared ERP workspace provider for Supabase session tokens, active business selection, authenticated API calls, and demo fallback.
- High-volume POS/marketplace/bank rows enter the raw transaction layer first. Workspace loading is bounded and does not return raw rows; raw detail is paginated through `/api/erp/raw-transactions`, summaries through `/api/erp/daily-summaries`, and reconciliation through `/api/erp/reconciliation`.

## Guardrails

- Every accounting transaction produces balanced journal lines.
- Unbalanced opening balances require an explicit offset account; silent balancing is rejected.
- Locked periods reject direct mutation; corrections should use reversal/correction entries.
- Every business-scoped table includes `business_id` and role-based RLS policies.
- Audit triggers capture high-risk table changes and include tenant/user metadata.
- Inventory valuation rejects negative stock by default.
- Payroll rejects invalid work-day counts and deductions above gross pay.
- API responses are not stored by the service worker cache.
- Raw transaction imports use idempotent external identifiers, duplicate detection, validation preview, commit, summarize, daily summary posting, and rollback status transitions.
- Supabase Storage attachment paths are tenant-scoped by business id and validated against the owning document before metadata is inserted.
- Coretax output is a preparation package only, not direct tax submission.
- Operational documents are the primary user input. Journals, AR/AP, stock movement, and payroll accounting are generated behind the scenes.

## Current Scope

- Implemented: ERP workspace shell, server/browser Supabase session bridge, active business context, page proxy guard, sales/purchase/payment/stock/payroll APIs, master-data CRUD, email pending invites, stock transfer, period lock, document void/reversal RPC contract, raw CSV preview/commit, paginated raw endpoints, daily summary posting, reconciliation report, signed Storage upload, attachment metadata, Supabase-auth demo account sandboxes with reset RPC/Cron endpoint, dashboard tasks/activity, SAK EMKM-style reports, XLSX/PDF exports, API permission guard, ERP RLS migrations, audit/integrity triggers, structured logs, and automated tests.
- Pending for hosted production: apply migrations to a real Supabase project, configure SMTP/email delivery for invite acceptance, run real Supabase RLS integration tests, verify backup/restore, connect logs to hosted monitoring, and complete UAT with pilot UMKM data.
