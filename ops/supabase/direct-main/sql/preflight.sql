\set ON_ERROR_STOP on
\pset pager off
\pset null '<null>'

\if :{?expected_project_ref}
\else
  \echo 'expected_project_ref is required.'
  \quit 2
\endif

begin isolation level repeatable read, read only;

set local lock_timeout = '3s';
set local statement_timeout = '30s';
set local idle_in_transaction_session_timeout = '60s';

select
  1 / case
    when :'expected_project_ref' = 'sxhbjwuurkwrnjmnpnix'
      and current_user = 'postgres'
      and current_database() = 'postgres'
      and current_setting('server_version_num')::integer >= 170000
      and current_setting('transaction_read_only') = 'on'
      and current_setting('application_name') =
        'valuintcorp-direct-main:' || :'expected_project_ref' || ':preflight'
    then 1
    else 0
  end as direct_main_read_only_target_guard;

\ir _snapshot-body.sql

commit;
