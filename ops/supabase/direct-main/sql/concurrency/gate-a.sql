\set ON_ERROR_STOP on
\pset pager off

\if :{?marker_file}
\else
  \echo 'marker_file is required.'
  \quit 2
\endif

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

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(
    'valuintcorp-cutover-harness-item|' || :'expected_project_ref',
    0
  )
);
\o :marker_file
\pset tuples_only on
select 'GATE_A_ITEM_ACQUIRED';
\o
\pset tuples_only off

select pg_catalog.pg_sleep(5);
commit;

\echo 'GATE_A_ITEM_RELEASED'
