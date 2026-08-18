-- Fase 4.1 authorization integration checks.
-- Run in the Supabase SQL editor after the migration. Everything is rolled back.
begin;

-- Synthetic identities make the test deterministic even on an empty project.
-- The auth trigger provisions their profiles/agentes; the outer rollback removes all of them.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000411',
    'authenticated', 'authenticated', 'security-agent-owner@footbase.invalid', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"admin","full_name":"Security Owner"}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000412',
    'authenticated', 'authenticated', 'security-agent-other@footbase.invalid', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"agent","full_name":"Security Other"}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000413',
    'authenticated', 'authenticated', 'security-club@footbase.invalid', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"club","full_name":"Security Club"}'::jsonb, now(), now()
  );

do $$
begin
  if (select role from public.profiles where id = '00000000-0000-4000-8000-000000000411') <> 'agent'
    or (select account_status from public.profiles where id = '00000000-0000-4000-8000-000000000411') <> 'pending'
  then
    raise exception 'SECURITY TEST FAILED: signup metadata created privileged account state';
  end if;
end;
$$;

select set_config('request.jwt.claim.role', 'service_role', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000000","role":"service_role"}',
  true
);
update public.profiles
set account_status = 'approved'
where id in (
  '00000000-0000-4000-8000-000000000411',
  '00000000-0000-4000-8000-000000000412'
);
update public.agentes
set verified_status = 'verified'
where user_id in (
  '00000000-0000-4000-8000-000000000411',
  '00000000-0000-4000-8000-000000000412'
);
insert into public.atletas (
  bid, name, birth_date, main_position, agent_id, claim_status
) values (
  9191919411, 'Security Athlete', '2008-01-01', 'CB',
  (select id from public.agentes where user_id = '00000000-0000-4000-8000-000000000411'),
  'claimed'
);

select set_config(
  'footbase.test_user',
  '00000000-0000-4000-8000-000000000411',
  true
);
select set_config('request.jwt.claim.sub', current_setting('footbase.test_user'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', current_setting('footbase.test_user'), 'role', 'authenticated')::text,
  true
);

set local role authenticated;

do $$
declare
  v_user uuid := nullif(current_setting('footbase.test_user', true), '')::uuid;
  v_rows integer;
begin
  if v_user is null then
    raise notice 'SKIP profile tests: no non-admin profile exists';
    return;
  end if;

  update public.profiles
  set organization = left(coalesce(organization, ''), 250) || ' [security test]'
  where id = v_user;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'SECURITY TEST FAILED: own allowlisted profile update was denied';
  end if;

  begin
    update public.profiles set role = 'admin', account_status = 'approved' where id = v_user;
    raise exception 'SECURITY TEST FAILED: profile self-elevation succeeded';
  exception
    when others then
      if sqlerrm like 'SECURITY TEST FAILED:%' then raise; end if;
      if sqlerrm not like 'users may only edit%' then
        raise exception 'SECURITY TEST FAILED: unexpected profile guard error: %', sqlerrm;
      end if;
  end;

  if exists (select 1 from public.agentes where user_id = v_user) then
    update public.agentes
    set bio = left(coalesce(bio, ''), 798) || 'x'
    where user_id = v_user;
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then
      raise exception 'SECURITY TEST FAILED: own allowlisted agent profile update was denied';
    end if;

    begin
      update public.agentes set created_at = created_at + interval '1 second' where user_id = v_user;
      raise exception 'SECURITY TEST FAILED: agent changed immutable audit data';
    exception
      when others then
        if sqlerrm like 'SECURITY TEST FAILED:%' then raise; end if;
        if sqlerrm not like 'agents may only edit%' then
          raise exception 'SECURITY TEST FAILED: unexpected agent guard error: %', sqlerrm;
        end if;
    end;
  end if;
end;
$$;

reset role;

select set_config(
  'footbase.test_owner',
  coalesce((
    select a.user_id::text
    from public.agentes a
    join public.profiles p on p.id = a.user_id
    join public.atletas at on at.agent_id = a.id
    where a.verified_status = 'verified'
      and p.role = 'agent'
      and p.account_status = 'approved'
      and at.claim_status = 'claimed'
    limit 1
  ), ''),
  true
);
select set_config(
  'footbase.test_bid',
  coalesce((
    select at.bid::text
    from public.agentes a
    join public.profiles p on p.id = a.user_id
    join public.atletas at on at.agent_id = a.id
    where a.user_id::text = current_setting('footbase.test_owner')
      and a.verified_status = 'verified'
      and p.account_status = 'approved'
      and at.claim_status = 'claimed'
    limit 1
  ), ''),
  true
);
select set_config('request.jwt.claim.sub', current_setting('footbase.test_owner'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', current_setting('footbase.test_owner'), 'role', 'authenticated')::text,
  true
);

set local role authenticated;

do $$
declare
  v_user uuid := nullif(current_setting('footbase.test_owner', true), '')::uuid;
  v_bid bigint := nullif(current_setting('footbase.test_bid', true), '')::bigint;
  v_request uuid;
  v_current text;
  v_expected text;
  v_rows integer;
begin
  if v_user is null or v_bid is null then
    raise notice 'SKIP athlete/correction tests: no approved verified owner with a claimed athlete exists';
    return;
  end if;

  update public.atletas
  set apelido = left(coalesce(apelido, ''), 200) || ' [security test]'
  where bid = v_bid;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'SECURITY TEST FAILED: one of the six allowlisted athlete fields was denied';
  end if;

  begin
    update public.atletas set created_at = created_at + interval '1 second' where bid = v_bid;
    raise exception 'SECURITY TEST FAILED: agent changed immutable athlete audit data';
  exception
    when others then
      if sqlerrm like 'SECURITY TEST FAILED:%' then raise; end if;
      if sqlerrm not like 'agents may only edit%' then
        raise exception 'SECURITY TEST FAILED: unexpected athlete guard error: %', sqlerrm;
      end if;
  end;

  select name into v_expected from public.atletas where bid = v_bid;
  insert into public.solicitacoes_correcao (
    bid_atleta, requested_by, field_name, current_value, suggested_value, reason
  ) values (
    v_bid, v_user, 'name', 'spoofed value', 'Security test suggestion', 'Security integration test'
  ) returning id, current_value into v_request, v_current;

  if v_current is distinct from v_expected then
    raise exception 'SECURITY TEST FAILED: correction current_value was not captured by the database';
  end if;

  update public.solicitacoes_correcao
  set current_value = 'tampered', status = 'approved'
  where id = v_request;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'SECURITY TEST FAILED: agent changed an immutable correction';
  end if;
end;
$$;

reset role;

-- A different agent cannot update the selected claimed athlete.
select set_config(
  'footbase.test_other_agent',
  coalesce((
    select p.id::text
    from public.profiles p
    where p.role = 'agent'
      and p.id::text <> current_setting('footbase.test_owner')
    limit 1
  ), ''),
  true
);
select set_config('request.jwt.claim.sub', current_setting('footbase.test_other_agent'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', current_setting('footbase.test_other_agent'), 'role', 'authenticated')::text,
  true
);
set local role authenticated;
do $$
declare
  v_user uuid := nullif(current_setting('footbase.test_other_agent', true), '')::uuid;
  v_bid bigint := nullif(current_setting('footbase.test_bid', true), '')::bigint;
  v_rows integer;
begin
  if v_user is null or v_bid is null then
    raise notice 'SKIP cross-agent test: a second agent or claimed athlete is unavailable';
    return;
  end if;
  update public.atletas set apelido = apelido where bid = v_bid;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'SECURITY TEST FAILED: another agent updated the claimed athlete';
  end if;
end;
$$;
reset role;

-- Club accounts never receive the agent editing surface or its database rights.
select set_config(
  'footbase.test_club',
  coalesce((select id::text from public.profiles where role = 'club' limit 1), ''),
  true
);
select set_config('request.jwt.claim.sub', current_setting('footbase.test_club'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', current_setting('footbase.test_club'), 'role', 'authenticated')::text,
  true
);
set local role authenticated;
do $$
declare
  v_user uuid := nullif(current_setting('footbase.test_club', true), '')::uuid;
  v_bid bigint := nullif(current_setting('footbase.test_bid', true), '')::bigint;
  v_rows integer;
begin
  if v_user is null or v_bid is null then
    raise notice 'SKIP club test: a club account or claimed athlete is unavailable';
    return;
  end if;
  update public.atletas set apelido = apelido where bid = v_bid;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'SECURITY TEST FAILED: club updated an agent athlete';
  end if;
end;
$$;
reset role;
select 'SECURITY_TESTS_PASSED' as result;
rollback;
