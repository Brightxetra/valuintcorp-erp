# Direct-Main Maintenance and Freeze Checklist

Target project ref: `sxhbjwuurkwrnjmnpnix`

Cutover date (UTC / WIB): ______________________________

Operator: ____________________  Observer: ____________________

## Before the freeze

- [ ] Exact application commit/SHA selected and recorded.
- [ ] Current Vercel production deployment ID and immutable rollback URL
      recorded.
- [ ] Production-target candidate was built from the exact selected SHA with
      production environment validation; no domain was switched.
- [ ] Cutover window does not overlap the Vercel Cron at `17:00 UTC`
      (`00:00 WIB`).
- [ ] `psql`, `pg_dump`, and `pg_restore` are version 17 or newer.
- [ ] Direct/session-pooler connection values point to the exact project ref
      and port `5432`.
- [ ] Evidence directory exists outside the repository.
- [ ] No Docker-based fallback is planned or used.

## Freeze all writers

Freeze start (UTC / WIB): ______________________________

- [ ] General users cannot start new writes.
- [ ] Current production deployment writes are stopped or maintenance-gated.
- [ ] Every Vercel Preview deployment that can reach this Supabase project is
      stopped, protected, or otherwise prevented from writing.
- [ ] Vercel Cron is disabled/gated for the whole migration window.
- [ ] Local development servers, seed scripts, import scripts, test runners,
      SQL editors, and manual operators are not writing.
- [ ] No other integration, webhook, scheduled job, BI tool, or service-role
      consumer can write.
- [ ] `DIRECT_MAIN_FREEZE_ACK=WRITERS_FROZEN_AND_VERIFIED` is set only after
      the operator and observer agree.

## Preflight evidence

- [ ] Read-only preflight snapshot passed.
- [ ] Snapshot path recorded outside repository:
      ________________________________________________
- [ ] Snapshot SHA-256 recorded:
      ________________________________________________
- [ ] No unexpected active transaction or waiting lock exists.
- [ ] Public/Auth/Storage exact row counts were reviewed.
- [ ] Live migration history remains `001`–`020` plus `20260705004700` before
      reconciliation, unless a newer independently verified checkpoint is
      documented.
- [ ] Live effects of `021`–`027` were fingerprinted and match repository
      intent.
- [ ] Current grants, default ACLs, RLS, routines, constraints, and index state
      were reviewed.

## Recoverable affected-scope backup

- [ ] Custom-format archive completed for `public`, `app_private`, and
      `supabase_migrations`.
- [ ] Archive path:
      ________________________________________________
- [ ] TOC path:
      ________________________________________________
- [ ] Archive SHA-256:
      ________________________________________________
- [ ] `Prepare-AffectedScopeRestore.ps1` accepted the independently recorded
      checksum and all three required scopes.
- [ ] `New-ReviewedAffectedScopeRestoreList.ps1` created a new immutable
      restore TOC outside the repository, and its SHA-256 was independently
      recorded.
- [ ] The reviewed restore TOC suppressed exactly the three public
      `supabase_admin` default-ACL entries (FUNCTIONS, SEQUENCES, TABLES), kept
      every other entry active, and contained no unexpected default-ACL owner.
- [ ] Operator and observer understand the archive excludes Auth, Storage,
      project settings, secrets, object payloads, and custom-role passwords.
- [ ] Auth and Storage remain unchanged and their counts will be compared
      postflight.

## Migration-history reconciliation

- [ ] `021` marked applied only after its live fingerprint matched.
- [ ] `022` marked applied only after its live fingerprint matched.
- [ ] `023` marked applied only after its live fingerprint matched.
- [ ] `024` marked applied only after its live fingerprint matched.
- [ ] `025` marked applied only after its live fingerprint matched.
- [ ] `026` marked applied only after its live fingerprint matched.
- [ ] `027` marked applied only after its live fingerprint matched.
- [ ] Remote migration list shows `021`–`027` in order.
- [ ] Dry run does not propose replaying `021`–`027`.
- [ ] Neither `--include-all` nor reset was used.

## Coordinated migration execution

- [ ] ACL migration succeeded transactionally.
- [ ] Old/current application smoke passed after ACL hardening.
- [ ] Stock-receipt expand migration succeeded transactionally.
- [ ] Concurrent unique index migration ran by itself outside a transaction.
- [ ] Index is live, ready, valid, unique, exact-keyed, and exact-predicate.
- [ ] Activation migration succeeded transactionally.
- [ ] Inventory mutation hardening migration succeeded transactionally.
- [ ] Opposite-order multi-item POS lock choreography completed without
      `40P01`.
- [ ] Operation-identity constraint validation migration succeeded and the
      constraint is marked validated.
- [ ] Member-invite authority migration succeeded; direct acceptance is not
      executable and the actor-bound command is service-only.
- [ ] BPJS authorization migration succeeded; authenticated users retain only
      the intended read boundary and the write command is service-only.
- [ ] Authoritative POS pricing migration succeeded; client-supplied prices are
      ignored and `post_pos_sale_v2` is service-only.
- [ ] Financial command-only migration succeeded; authenticated users cannot
      mutate posted financial effects directly.
- [ ] Inventory command-only migration succeeded; authenticated users cannot
      mutate posted inventory effects directly and warehouse scope is active.
- [ ] Sensitive-read migration succeeded; attachment Storage policies are
      removed and payroll audit snapshots are redacted.
- [ ] Login-session binding migration succeeded; every active/history row has
      a unique non-null Supabase session binding and browser table access is
      revoked.
- [ ] Document-sequence authority migration succeeded; browser table/RPC access
      is revoked and atomic service allocation is active.
- [ ] Any failed concurrent index was handled only through the exact guarded
      concurrent-drop recovery path.

## Verification before traffic release

- [ ] Non-destructive multi-session lock harness passed.
- [ ] Authenticated login/session/workspace smoke passed.
- [ ] Member invite acceptance, BPJS write, authoritative-price POS sale,
      financial posting/void, inventory posting/void, private attachment view,
      sensitive report reads, and document-number allocation passed their
      bounded positive and negative smoke checks.
- [ ] One bounded stock receipt returned `created`.
- [ ] Same operation key and same payload returned `replayed`.
- [ ] Same operation key with a different payload returned the expected
      conflict.
- [ ] Exactly one movement and one activity event exist for the bounded smoke.
- [ ] Read-only postflight passed.
- [ ] Preflight/postflight row-count deltas are explained.
- [ ] Auth and Storage counts are unchanged.
- [ ] Supabase advisors/logs have no new cutover-caused blocking issue.
- [ ] Production-target Vercel candidate is the exact selected SHA and its
      production configuration is complete.
- [ ] Candidate smoke passed before domain promotion.

## Traffic release and observation

Release time (UTC / WIB): ______________________________

- [ ] Domain/alias promotion completed to the verified candidate.
- [ ] Immediate route/login/workspace/stock-receipt smoke passed.
- [ ] Error rate, stock-receipt conflicts, Auth failures, and database sessions
      monitored for 15 minutes.
- [ ] Same signals monitored again through 60 minutes.
- [ ] Previous Vercel production deployment remains available for application
      rollback only if its database compatibility is explicitly proven.
- [ ] Operator and observer acknowledge that the security batch contains
      contract migrations; Vercel alias rollback alone is not a database
      rollback.
- [ ] Validated affected-scope restore evidence or a separately reviewed
      forward compatibility correction is ready before relying on an old app
      artifact.
- [ ] Freeze was released only after operator and observer signed off.

Operator sign-off: ____________________  Time: ____________________

Observer sign-off: ____________________  Time: ____________________
