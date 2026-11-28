begin;

create extension if not exists pgtap with schema extensions;

select plan(27);

select ok(
  has_function_privilege(
    'service_role',
    'public.accept_pending_member_invites_for_user(jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.accept_pending_member_invites_for_user(jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.accept_pending_member_invites_for_user(jsonb)',
    'EXECUTE'
  )
  and exists (
    select 1
    from pg_catalog.pg_proc procedure_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    where procedure_record.oid =
      'public.accept_pending_member_invites_for_user(jsonb)'::regprocedure
      and namespace_record.nspname = 'public'
      and procedure_record.prosecdef
      and procedure_record.proconfig = array['search_path=pg_catalog']::text[]
  ),
  'only service_role can execute the fixed-path invite acceptance command'
);

select ok(
  not has_function_privilege(
    'service_role',
    'public.accept_member_invite(uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.accept_member_invite(uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.accept_member_invite(uuid)',
    'EXECUTE'
  ),
  'the legacy invite acceptance function has no API execution path'
);

select ok(
  has_table_privilege('authenticated', 'public.member_invites', 'SELECT')
  and has_table_privilege('authenticated', 'public.member_invites', 'INSERT')
  and has_table_privilege('authenticated', 'public.member_invites', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.member_invites', 'DELETE')
  and not has_table_privilege('authenticated', 'public.member_invites', 'TRUNCATE'),
  'authenticated retains only the invite privileges required by the application'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_trigger trigger_record
    where trigger_record.tgrelid = 'public.member_invites'::regclass
      and trigger_record.tgname = 'protect_member_invite_update'
      and not trigger_record.tgisinternal
  ),
  'member invite security fields are protected by a database trigger'
);

select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename = 'member_invites'
      and (
        coalesce(qual, '') ilike '%member_has_permission%admin:manage_users%'
        or coalesce(with_check, '') ilike '%member_has_permission%admin:manage_users%'
      )
  ),
  3::bigint,
  'all invite policies use effective user-management permission checks'
);

insert into public.businesses (
  id,
  legal_name,
  display_name,
  industry,
  owner_name
)
values (
  '10000000-0000-4000-8000-00000000c001',
  'Member Invite Test',
  'Member Invite Test',
  'retail',
  'Owner Test'
);

insert into public.business_members (
  business_id,
  auth_user_id,
  role,
  access_scope,
  access_permissions
)
values
  (
    '10000000-0000-4000-8000-00000000c001',
    '20000000-0000-4000-8000-00000000c001',
    'owner',
    'role',
    '{}'
  ),
  (
    '10000000-0000-4000-8000-00000000c001',
    '20000000-0000-4000-8000-00000000c002',
    'finance_admin',
    'role',
    '{}'
  ),
  (
    '10000000-0000-4000-8000-00000000c001',
    '20000000-0000-4000-8000-00000000c003',
    'finance_admin',
    'custom',
    array[
      'admin:manage_users',
      'business:read',
      'accounting:write',
      'inventory:manage'
    ]
  );

select is(
  app_private.member_has_permission_for_actor(
    '10000000-0000-4000-8000-00000000c001',
    '20000000-0000-4000-8000-00000000c002',
    'admin:manage_users'
  ),
  false,
  'default finance administrators do not inherit user-management authority'
);

select is(
  app_private.member_invite_assignment_allowed_for_actor(
    '10000000-0000-4000-8000-00000000c001',
    '20000000-0000-4000-8000-00000000c002',
    'owner',
    'role',
    '{}',
    '{}'
  ),
  false,
  'a finance administrator cannot assign the owner role'
);

select is(
  app_private.member_invite_assignment_allowed_for_actor(
    '10000000-0000-4000-8000-00000000c001',
    '20000000-0000-4000-8000-00000000c003',
    'owner',
    'role',
    '{}',
    '{}'
  ),
  false,
  'custom user-management permission does not bypass the role ceiling'
);

select is(
  app_private.member_invite_assignment_allowed_for_actor(
    '10000000-0000-4000-8000-00000000c001',
    '20000000-0000-4000-8000-00000000c003',
    'staff',
    'role',
    '{}',
    '{}'
  ),
  true,
  'a delegated administrator can assign a lower role within its permissions'
);

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"20000000-0000-4000-8000-00000000c002"}',
  true
);
set local role authenticated;

select throws_ok(
  $command$
    insert into public.member_invites (
      business_id, email, role, status, invited_by, expires_at
    ) values (
      '10000000-0000-4000-8000-00000000c001',
      'finance-self@example.com',
      'owner',
      'pending',
      '20000000-0000-4000-8000-00000000c002',
      statement_timestamp() + interval '14 days'
    )
  $command$,
  '42501',
  'new row violates row-level security policy for table "member_invites"',
  'a default finance administrator cannot create a self-promoting owner invite'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"20000000-0000-4000-8000-00000000c003"}',
  true
);
set local role authenticated;

select throws_ok(
  $command$
    insert into public.member_invites (
      business_id, email, role, status, invited_by, expires_at
    ) values (
      '10000000-0000-4000-8000-00000000c001',
      'delegated-owner@example.com',
      'owner',
      'pending',
      '20000000-0000-4000-8000-00000000c003',
      statement_timestamp() + interval '14 days'
    )
  $command$,
  '42501',
  'new row violates row-level security policy for table "member_invites"',
  'a delegated administrator cannot create an invite above its authority'
);

select lives_ok(
  $command$
    insert into public.member_invites (
      id, business_id, email, role, status, invited_by, expires_at
    ) values (
      '30000000-0000-4000-8000-00000000c001',
      '10000000-0000-4000-8000-00000000c001',
      'staff-target@example.com',
      'staff',
      'pending',
      '20000000-0000-4000-8000-00000000c003',
      statement_timestamp() + interval '14 days'
    )
  $command$,
  'a delegated administrator can create a bounded staff invite'
);

select is(
  (
    select count(*)
    from public.member_invites
    where id = '30000000-0000-4000-8000-00000000c001'
      and status = 'pending'
  ),
  1::bigint,
  'the legitimate invite is stored once as pending'
);

select throws_ok(
  $command$
    update public.member_invites
    set role = 'owner'
    where id = '30000000-0000-4000-8000-00000000c001'
  $command$,
  '42501',
  'Member invite assignment fields are immutable.',
  'an authenticated administrator cannot rewrite invite authority fields'
);

reset role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

select is(
  public.accept_pending_member_invites_for_user(
    '{
      "targetUserId":"20000000-0000-4000-8000-00000000c004",
      "targetEmail":"STAFF-TARGET@example.com"
    }'::jsonb
  ),
  1,
  'the service command accepts one legitimate normalized-email invite'
);

select is(
  (
    select count(*)
    from public.business_members
    where business_id = '10000000-0000-4000-8000-00000000c001'
      and auth_user_id = '20000000-0000-4000-8000-00000000c004'
  ),
  1::bigint,
  'legitimate acceptance creates exactly one membership'
);

select is(
  (
    select role
    from public.business_members
    where business_id = '10000000-0000-4000-8000-00000000c001'
      and auth_user_id = '20000000-0000-4000-8000-00000000c004'
  ),
  'staff',
  'the created membership preserves the bounded role'
);

select ok(
  exists (
    select 1
    from public.member_invites
    where id = '30000000-0000-4000-8000-00000000c001'
      and status = 'accepted'
      and accepted_by = '20000000-0000-4000-8000-00000000c004'
      and accepted_at is not null
  ),
  'the accepted invite records the validated target user'
);

select is(
  public.accept_pending_member_invites_for_user(
    '{
      "targetUserId":"20000000-0000-4000-8000-00000000c004",
      "targetEmail":"staff-target@example.com"
    }'::jsonb
  ),
  0,
  'replaying acceptance does not accept the same invite twice'
);

select is(
  (
    select count(*)
    from public.business_members
    where business_id = '10000000-0000-4000-8000-00000000c001'
      and auth_user_id = '20000000-0000-4000-8000-00000000c004'
  ),
  1::bigint,
  'replayed acceptance leaves exactly one membership'
);

reset role;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"20000000-0000-4000-8000-00000000c003"}',
  true
);
set local role authenticated;

insert into public.member_invites (
  id, business_id, email, role, status, invited_by, expires_at
)
values (
  '30000000-0000-4000-8000-00000000c002',
  '10000000-0000-4000-8000-00000000c001',
  'stale-target@example.com',
  'staff',
  'pending',
  '20000000-0000-4000-8000-00000000c003',
  statement_timestamp() + interval '14 days'
);
reset role;
update public.business_members
set access_permissions = array['business:read']
where business_id = '10000000-0000-4000-8000-00000000c001'
  and auth_user_id = '20000000-0000-4000-8000-00000000c003';

select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

select throws_ok(
  $command$
    select public.accept_pending_member_invites_for_user(
      '{
        "targetUserId":"20000000-0000-4000-8000-00000000c005",
        "targetEmail":"stale-target@example.com"
      }'::jsonb
    )
  $command$,
  '42501',
  'The member invite authority is no longer valid.',
  'acceptance fails after the inviter loses user-management authority'
);

select is(
  (
    select count(*)
    from public.business_members
    where business_id = '10000000-0000-4000-8000-00000000c001'
      and auth_user_id = '20000000-0000-4000-8000-00000000c005'
  ),
  0::bigint,
  'stale inviter acceptance creates no membership'
);

select is(
  (
    select status
    from public.member_invites
    where id = '30000000-0000-4000-8000-00000000c002'
  ),
  'pending',
  'a rejected stale invite remains pending for explicit revocation and audit'
);

reset role;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"20000000-0000-4000-8000-00000000c001"}',
  true
);
set local role authenticated;

select throws_ok($$
  insert into public.member_invites (business_id, email, role, status, invited_by, expires_at)
  values ('10000000-0000-4000-8000-00000000c001', 'privileged@example.test', 'owner',
    'pending', '20000000-0000-4000-8000-00000000c001', statement_timestamp() + interval '14 days')
$$, '42501', 'new row violates row-level security policy "privileged roles cannot be invited" for table "member_invites"',
  'an owner can only propose another owner through the transfer workflow');

-- Simulate a privileged invite from before the transfer workflow was introduced.
reset role;
insert into public.member_invites (
  id, business_id, email, role, status, invited_by, expires_at
)
values (
  '30000000-0000-4000-8000-00000000c003',
  '10000000-0000-4000-8000-00000000c001',
  'owner-self@example.com',
  'owner',
  'pending',
  '20000000-0000-4000-8000-00000000c001',
  statement_timestamp() + interval '14 days'
);
set local role authenticated;

select throws_ok(
  $command$
    update public.member_invites
    set
      status = 'accepted',
      accepted_by = '20000000-0000-4000-8000-00000000c006',
      accepted_at = statement_timestamp()
    where id = '30000000-0000-4000-8000-00000000c003'
  $command$,
  '42501',
  'Member invites can only be accepted by the validated invite command.',
  'direct authenticated DML cannot mark an invite accepted'
);

reset role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

select throws_ok(
  $command$
    select public.accept_pending_member_invites_for_user(
      '{
        "targetUserId":"20000000-0000-4000-8000-00000000c001",
        "targetEmail":"owner-self@example.com"
      }'::jsonb
    )
  $command$,
  '42501',
  'The member invite has no independent authorized inviter.',
  'even an owner cannot use an invite to promote the same account'
);

select is(
  (
    select status
    from public.member_invites
    where id = '30000000-0000-4000-8000-00000000c003'
  ),
  'pending',
  'a rejected self-invite is not consumed'
);

select * from finish();

rollback;
