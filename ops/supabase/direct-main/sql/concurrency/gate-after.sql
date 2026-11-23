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
set local statement_timeout = '5s';

select pg_catalog.pg_try_advisory_xact_lock(
  pg_catalog.hashtextextended('posting-period-dml-global', 0)
)::text as acquired
\gset gate_after_

\if :gate_after_acquired
  \echo 'GATE_AFTER_RELEASE_PASS'
\else
  \echo 'GATE_AFTER_RELEASE_FAIL'
  \quit 7
\endif

rollback;
