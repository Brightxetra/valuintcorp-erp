begin;

alter table public.employees
  add column if not exists bpjs_participation text not null default 'both';

alter table public.employees
  drop constraint if exists employees_bpjs_participation_check;

alter table public.employees
  add constraint employees_bpjs_participation_check
  check (bpjs_participation in ('none', 'health', 'employment', 'both'));

comment on column public.employees.bpjs_participation is
  'Per-employee BPJS enrollment: none, health, employment, or both.';

commit;
