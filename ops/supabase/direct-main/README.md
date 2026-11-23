# Valuintcorp Direct-Main Supabase Operator Pack

This pack is for one controlled cutover against the explicitly approved
pre-launch Supabase main project:

- project ref: `sxhbjwuurkwrnjmnpnix`
- database: PostgreSQL 17
- connection type: direct or session pooler on port `5432`
- deployment model: coordinated database/application cutover with a writer
  freeze; the final security migrations include contract changes

Every helper fails closed. It does not discover or choose a project, does not
read a password from a file, does not use a transaction pooler, and refuses to
write evidence or backup artifacts inside the repository.

Nothing in this directory is run automatically. Adding this pack does not
change Supabase, Vercel, migration history, or application data.

## Hard safety rules

1. Do not use `supabase db reset`, `db push --include-all`, or replay migrations
   `021` through `027` on this database.
2. Do not run any mutating step until the maintenance freeze, preflight
   snapshot, and affected-scope backup have all passed.
3. Do not wrap
   `20260722033028_stock_receipt_operation_key_unique_index.sql` in a
   transaction. `CREATE UNIQUE INDEX CONCURRENTLY` must be its own
   non-transactional step.
4. Do not run activation if the operation-key index is missing, invalid, not
   ready, recorded despite failure, or has a different definition.
5. Do not treat Vercel rollback as database rollback. After the contract
   migrations, an old application artifact may be incompatible with the new
   privilege/session model. Use a reviewed forward fix or the validated
   affected-scope recovery path.
6. Do not use Docker for this runbook. Repository policy requires separate,
   explicit user approval before Docker use.
7. Never put a database password, access token, connection URI, backup, or
   generated evidence file in this repository.

## Prerequisites

Use PostgreSQL client tools version 17 or newer:

```powershell
psql --version
pg_dump --version
pg_restore --version
```

If any client is unavailable, stop. Do not silently substitute a container or
an unreviewed installer.

Set connection inputs only in the current process environment. The password
must come from the approved secret source and must not be typed into a tracked
file or command argument.

```powershell
$env:SUPABASE_PROJECT_REF = "sxhbjwuurkwrnjmnpnix"
$env:PGHOST = "db.sxhbjwuurkwrnjmnpnix.supabase.co"
$env:PGPORT = "5432"
$env:PGDATABASE = "postgres"
$env:PGUSER = "postgres"
$env:PGSSLMODE = "require"

# PGPASSWORD must already be injected into this process by the approved secret
# source. This assertion does not print it.
if (-not $env:PGPASSWORD) { throw "PGPASSWORD is not set." }
```

For the Supabase session pooler, use its documented session hostname and set
`PGUSER` to `postgres.sxhbjwuurkwrnjmnpnix`. The guard rejects transaction
pooler port `6543`.

Create an evidence directory outside the repository. All examples below use
`C:\valuintcorp-cutover-evidence`; choose another absolute external path if
needed.

## Phase 0: maintenance and writer freeze

Complete every item in
[`MAINTENANCE-CHECKLIST.md`](./MAINTENANCE-CHECKLIST.md). In particular:

- stop or gate production, Preview, local script, seed, and operator writes;
- prevent the Vercel Cron scheduled at `17:00 UTC` (`00:00 WIB`) from
  overlapping the cutover;
- record the immutable Vercel rollback deployment before any database change;
- confirm there is no active transaction, waiting lock, or unexpected writer;
- keep one operator and one observer assigned through the whole window.

After the freeze is independently verified:

```powershell
$env:DIRECT_MAIN_FREEZE_ACK = "WRITERS_FROZEN_AND_VERIFIED"
```

This acknowledgement is intentionally required by backup, concurrency, and
index-recovery helpers.

## Phase 1: read-only preflight snapshot

```powershell
.\ops\supabase\direct-main\powershell\Invoke-ReadOnlySnapshot.ps1 `
  -Phase Preflight `
  -OutputDirectory "C:\valuintcorp-cutover-evidence"
```

The snapshot opens a repeatable-read, read-only transaction and records only
metadata and counts:

- PostgreSQL identity/version and database size;
- installed extensions;
- migration versions, without stored migration SQL;
- direct and effective table grants;
- default ACLs;
- routine identity, owner, security mode, configuration, and effective
  `EXECUTE` grants, without function definitions;
- RLS coverage and policy matrix, without policy expressions;
- aggregate session and lock state, without queries or client addresses;
- stock-receipt columns, constraint, and concurrent-index state;
- exact row counts for public tables and bounded Auth/Storage counts, without
  emitting business rows.

The script prints the evidence path and SHA-256. Record both in the external
cutover log. Any SQL error or failed guard is NO-GO.

## Phase 2: recoverable affected-scope backup

The Supabase project is on the Free plan, so this runbook does not assume a
managed daily backup or PITR restore point. Create a logical archive after
writers are frozen:

```powershell
.\ops\supabase\direct-main\powershell\New-ApplicationLogicalBackup.ps1 `
  -OutputDirectory "C:\valuintcorp-cutover-evidence"
```

The custom-format archive contains schema, data, and ACLs for:

- `public`
- `app_private`
- `supabase_migrations`

Object owners are omitted so recovery can run as the explicitly selected
database operator. The helper also writes a `pg_restore --list` TOC and a
SHA-256 file. A failed dump, unreadable TOC, or missing checksum is NO-GO.

### Exact backup limits

This is an affected-scope migration-recovery archive, not a complete Supabase
project export.

- The reviewed migrations mutate `public`, `app_private`, and
  `supabase_migrations`; those scopes are archived.
- They do not mutate `auth` or `storage`. Preserve those schemas in place by
  maintaining the writer freeze and requiring their preflight/postflight row
  counts to remain unchanged.
- Storage has no buckets or objects at the verified baseline. Storage object
  payloads are never included in a PostgreSQL logical dump.
- The five existing Auth identities remain in the unchanged hosted Auth
  schema. A new-project restore would need a separately reviewed identity
  migration that preserves UUIDs before application data is loaded.
- Project settings, API keys, secrets, network configuration, custom-role
  passwords, and Vercel configuration are outside this archive.

Therefore this artifact supports in-place recovery of the scopes changed by
this cutover and selective table recovery. It is not sufficient by itself for
project deletion or a new-project clone.

Validate a candidate archive without opening a database connection:

```powershell
.\ops\supabase\direct-main\powershell\Prepare-AffectedScopeRestore.ps1 `
  -BackupFile "C:\valuintcorp-cutover-evidence\<archive>.dump" `
  -ExpectedSha256 "<independently-recorded-64-character-sha256>"
```

Before a full affected-scope restore, create a new immutable `--use-list`
file outside the repository:

```powershell
.\ops\supabase\direct-main\powershell\New-ReviewedAffectedScopeRestoreList.ps1 `
  -BackupFile "C:\valuintcorp-cutover-evidence\<archive>.dump" `
  -ExpectedSha256 "<independently-recorded-64-character-sha256>" `
  -OutputFile "C:\valuintcorp-cutover-evidence\<archive>.restore.toc"
```

The helper fails closed unless the archive has exactly one public
`supabase_admin` default-ACL record for functions, sequences, and tables. It
comments out only those three records and leaves every other TOC entry active.
This is necessary because the hosted `postgres` login is not a member of
`supabase_admin`; replaying those records directly fails with `permission
denied to change default privileges`. Omitting them is also fail-closed: future
objects created by `supabase_admin` do not receive the archived broad public
schema defaults. Record and independently compare the restore-TOC SHA-256.

## Phase 3: reconcile migration history before new DDL

Live effects of repository migrations `021` through `027` already exist while
the migration history omits them. This is metadata drift, not permission to
replay SQL.

For each version `021` through `027`, in order:

1. compare the live schema fingerprint to the corresponding repository
   migration;
2. stop on any mismatch;
3. mark only that verified version as applied using the reviewed Supabase
   migration-history repair path;
4. list remote history again;
5. prove a dry run does not propose replaying `021` through `027`.

Discover the installed CLI syntax with `supabase migration repair --help`
before use. If the CLI is unavailable, use the authenticated Supabase operator
path selected for the cutover. Migration repair changes tracking metadata only;
it does not execute the migration SQL.

Never use `--include-all` or reset.

## Phase 4: apply the reviewed cutover chain

Apply only these new migrations, in order:

1. `20260719072824_harden_public_api_privileges.sql`
   - transactional;
   - verify the expected Data API compatibility matrix immediately;
   - abort if the currently serving application loses a required path.
2. `20260719081805_stock_receipt_service_rpc.sql`
   - transactional expand migration;
   - preserves legacy `NULL` operation-key writes.
3. `20260722033028_stock_receipt_operation_key_unique_index.sql`
   - standalone, non-transactional `CREATE UNIQUE INDEX CONCURRENTLY`;
   - never combine with another migration transaction;
   - inspect `indisready`, `indisvalid`, definition, key order, uniqueness, and
     predicate before continuing.
4. `20260722033031_activate_stock_receipt_service_rpc.sql`
   - transactional activation;
   - its guard must validate the exact columns, constraint, and index before
     granting the service-only RPC.
5. `20260723071330_harden_inventory_mutation_locking.sql`
   - transactional;
   - makes the actor-bound POS wrapper pre-lock every parent/component
     inventory key in canonical UUID order;
   - revokes `service_role` access to the internal POS implementation;
   - closes the stock-movement `UPDATE` negative-balance bypass.
6. `20260723071331_validate_stock_movement_operation_identity.sql`
   - transactional;
   - validates the previously `NOT VALID` operation-identity constraint;
   - stop on a bounded lock timeout or any legacy violating row.
7. `20260821070246_harden_member_invite_authority.sql`
   - transactional;
   - makes invite creation/acceptance actor-bound and prevents privilege
     escalation through stale or over-scoped invitations.
8. `20260821074131_harden_bpjs_policy_authorization.sql`
   - transactional;
   - replaces browser writes with the service-only, actor-bound BPJS command.
9. `20260821083243_enforce_authoritative_pos_pricing.sql`
   - transactional;
   - makes the catalog price authoritative and exposes only the actor-bound
     `post_pos_sale_v2` command to `service_role`.
10. `20260821085938_enforce_command_only_financial_documents.sql`
    - transactional;
    - revokes browser mutations of posted financial effects and requires
      actor-bound accounting commands.
11. `20260821093118_enforce_command_only_inventory_documents.sql`
    - transactional;
    - revokes browser mutations of posted stock effects and enforces effective
      permission plus assigned-warehouse scope.
12. `20260821100726_enforce_sensitive_read_boundaries.sql`
    - transactional;
    - narrows sensitive reads, removes direct Storage policies, and redacts
      payroll values from audit snapshots.
13. `20260821104115_bind_login_sessions_to_supabase_sessions.sql`
    - transactional;
    - revokes existing unbound application sessions and binds every new
      application session to one Supabase Auth session.
14. `20260821110627_harden_document_sequence_authority.sql`
    - transactional;
    - removes browser access to document counters and makes allocation atomic.

Migrations 7 through 14 are contract/security migrations, not a rolling
additive expansion. Once they start, keep the writer freeze active until the
exact new Vercel candidate has passed authenticated smoke and been promoted.
The old production artifact is not an independent application-only rollback
target after these migrations: restoring it may also require the validated
database backup or a separately reviewed forward compatibility correction.

Use the reviewed migration execution mechanism. Do not manually paste a
partial migration and do not record a migration version before its SQL has
succeeded.

## Invalid concurrent-index recovery

A failed concurrent build can leave the named index present but invalid. First
inspect it with the preflight snapshot. Do not drop a valid index and do not
use `DROP INDEX` without `CONCURRENTLY`.

The recovery helper will proceed only when all of these are true:

- the target is the pinned main project;
- writers are frozen;
- an affected-scope backup checksum has been recorded;
- the migration version `20260722033028` is not in remote history;
- the named object is the exact unique partial index on
  `(business_id, operation_key)`;
- the index is invalid or not ready.

```powershell
$env:DIRECT_MAIN_INDEX_RECOVERY_ACK = "DROP_ONLY_EXACT_INVALID_UNRECORDED_INDEX"
$env:DIRECT_MAIN_BACKUP_EVIDENCE_SHA256 = "<64-character-archive-sha256>"

.\ops\supabase\direct-main\powershell\Invoke-InvalidIndexRecovery.ps1 `
  -OutputDirectory "C:\valuintcorp-cutover-evidence"
```

The SQL intentionally runs outside a transaction and uses
`DROP INDEX CONCURRENTLY`. After it succeeds, re-run the read-only index check
and retry only the still-unrecorded standalone index migration. Activation
remains blocked until the index is ready and valid.

## Phase 5: non-destructive multi-session lock proof

Run the psql harness while the writer freeze is still active:

```powershell
.\ops\supabase\direct-main\powershell\Invoke-ConcurrencyHarness.ps1 `
  -OutputDirectory "C:\valuintcorp-cutover-evidence"
```

It opens multiple sessions and proves:

- identical operation-lock keys serialize across sessions;
- reverse-order multi-item input is represented by both sessions acquiring the
  same two inventory keys in the canonical order, completing without
  `40P01`;
- a simulated stock writer can hold the shared
  `posting-period-dml-global` gate while waiting on an item lock;
- the period-close exclusive try-lock fails in under one second instead of
  queueing;
- the exclusive gate is available after the posting sessions finish.

The harness uses only transaction-scoped advisory locks and rolls back where
appropriate. It never inserts, updates, or deletes an application row.

This proof does not replace a bounded authenticated stock-receipt smoke test.
It cannot prove “one created, one replayed” without committing a real
application row visible to another session. Prove that behavior through the
reviewed application/RPC smoke path, using an explicit operation key, then
verify exactly one movement and one activity event.

The inventory portion pairs a catalog assertion that the installed POS helper
orders `affected_item_id` with a non-destructive two-key runtime lock proof. A
real opposite-payload POS transaction remains an authenticated smoke gate.

## Phase 6: read-only postflight

```powershell
.\ops\supabase\direct-main\powershell\Invoke-ReadOnlySnapshot.ps1 `
  -Phase Postflight `
  -OutputDirectory "C:\valuintcorp-cutover-evidence"
```

In addition to the complete snapshot, postflight fails unless:

- migration history contains the exact reviewed 42-version set through
  `20260821110627`;
- the operation columns and pair constraint have the exact expected shape;
- the unique partial index is live, ready, valid, unique, and has the exact
  keys and predicate;
- the public stock-receipt RPC is `SECURITY DEFINER`, owned by `postgres`,
  pinned to `search_path=pg_catalog`, executable by `service_role`, and not
  executable by `anon` or `authenticated`;
- private/internal routines are not executable by Data API roles;
- the actor-bound POS wrapper remains service-only while its internal
  implementation cannot be invoked directly by `service_role`;
- every security-remediation command wrapper is owned by `postgres`, uses
  `SECURITY DEFINER` with `search_path=pg_catalog`, and is executable only by
  `service_role`;
- protected financial, inventory, BPJS, and journal implementation routines
  are not executable by Data API roles or `service_role`;
- posted financial/inventory tables, BPJS policies, attachments, application
  sessions, and document sequences have the exact command-only privilege
  matrix;
- every application session has a non-null, unique Supabase session binding;
- the three coordination/protection triggers exist and are enabled;
- every public table has RLS enabled;
- `anon` and `authenticated` have no `TRUNCATE`, `REFERENCES`, `TRIGGER`, or
  `MAINTAIN` privilege;
- `postgres` default ACLs do not auto-expose future tables, sequences, or
  functions.

Compare the preflight and postflight exact row counts. Auth and Storage counts
must not change. Business-table deltas must be explained only by the explicitly
approved smoke test.

## Recovery templates

`Prepare-AffectedScopeRestore.ps1` validates archive integrity and scope but
does not connect or restore. That is deliberate: `--clean` recovery can replace
the whole application schema and must be reviewed against the incident.

For a severe cutover-caused incident, keep writers frozen, take a second archive
of the damaged state, inspect both TOCs, and choose one:

### Selective table recovery

Prepare a reviewed TOC list containing only the required table data and
sequences. Reconcile or clear only those exact target rows, then run:

```powershell
pg_restore `
  --use-list "C:\outside-repo\reviewed-restore.toc" `
  --data-only `
  --exit-on-error `
  --single-transaction `
  --no-owner `
  "C:\outside-repo\valuintcorp-affected-scope-<timestamp>.dump"
```

The command uses `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`, and
`PGSSLMODE` from the process environment. No credential appears in its
arguments.

### Full affected-scope in-place recovery

Only after a separate line-by-line TOC review and explicit incident approval,
the bounded command shape is:

```powershell
pg_restore `
  --clean `
  --if-exists `
  --use-list "C:\outside-repo\reviewed-restore.toc" `
  --exit-on-error `
  --single-transaction `
  --no-owner `
  --schema=public `
  --schema=app_private `
  --schema=supabase_migrations `
  "C:\outside-repo\valuintcorp-affected-scope-<timestamp>.dump"
```

Do not run this as a routine rollback. It replaces the archived scopes and may
drop dependent application objects. It assumes the unchanged Auth identities
still exist with the same UUIDs. Re-run postflight, grants/RLS checks, Auth
login, and application smoke tests before releasing the freeze. If the
restore-TOC helper suppresses any count or owner other than the exact three
reviewed `supabase_admin` defaults, abort instead of weakening the filter.

## Abort conditions

Stop immediately and leave traffic frozen when any of these occurs:

- target/project-ref, role, database, PostgreSQL version, SSL, or connection
  type guard fails;
- unexpected writer, active transaction, waiting lock, or cutover overlap is
  observed;
- preflight evidence cannot be written outside the repository;
- affected-scope dump, TOC validation, or checksum fails;
- any `021`–`027` live fingerprint differs from repository intent;
- dry run proposes replaying `021`–`027`;
- ACL migration breaks the currently serving application;
- concurrent index is absent, invalid, not ready, wrongly defined, or wrongly
  recorded;
- activation, postflight, lock harness, authenticated smoke, or Vercel
  environment/deployment verification fails;
- Auth or Storage counts change unexpectedly.

Do not “continue and fix later.” Keep the old Vercel deployment available as
evidence and as a rollback option only where compatibility has been proved.
After contract migrations, choose a reviewed forward fix or the bounded
affected-scope recovery path; never switch the alias first and hope the old
artifact remains compatible.
