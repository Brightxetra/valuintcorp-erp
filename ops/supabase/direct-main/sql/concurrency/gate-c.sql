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

with clock_start as (
  select pg_catalog.clock_timestamp() as started_at
),
lock_attempt as (
  select
    pg_catalog.pg_try_advisory_xact_lock(
      pg_catalog.hashtextextended('posting-period-dml-global', 0)
    ) as acquired,
    clock_start.started_at
  from clock_start
)
select (
  not lock_attempt.acquired
  and extract(
    epoch from (pg_catalog.clock_timestamp() - lock_attempt.started_at)
  ) < 1
)::text as fail_fast_pass
from lock_attempt
\gset gate_

\if :gate_fail_fast_pass
  \echo 'GATE_C_FAIL_FAST_PASS'
\else
  \echo 'GATE_C_FAIL_FAST_FAIL'
  \quit 6
\endif

rollback;
