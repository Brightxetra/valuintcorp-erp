\set ON_ERROR_STOP on
\pset pager off

select
  1 / case
    when :'expected_project_ref' = 'sxhbjwuurkwrnjmnpnix'
      and current_user = 'postgres'
      and current_database() = 'postgres'
      and current_setting('application_name') =
        'valuintcorp-direct-main:' || :'expected_project_ref' || ':concurrency'
    then 1
    else 0
  end as concurrency_target_guard;

begin;
set local statement_timeout = '15s';
set local idle_in_transaction_session_timeout = '15s';

select pg_catalog.clock_timestamp() as wait_started
\gset identity_

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(
    'stock-receipt|00000000-0000-0000-0000-000000000000|00000000-0000-0000-0000-000000000000',
    0
  )
);

select (
  extract(
    epoch from (
      pg_catalog.clock_timestamp() - :'identity_wait_started'::timestamptz
    )
  ) >= 2
)::text as wait_pass
\gset identity_

\if :identity_wait_pass
  \echo 'IDENTITY_B_SERIALIZATION_PASS'
\else
  \echo 'IDENTITY_B_SERIALIZATION_FAIL'
  \quit 5
\endif

commit;
