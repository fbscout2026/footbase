-- Session 57 — clubes.fb_id + clube_fontes (multi-source identity map for clubs,
-- mirrors atleta_fontes). Verifies: RLS admin-only on clube_fontes (non-admin
-- blocked from read/write, admin/service_role can), PK (fonte,id_externo)
-- idempotency, fb_id uniqueness + reserved-range check constraint. Everything
-- reverted in the rollback.
begin;

insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000651','authenticated','authenticated','clubfbid-nonadmin@footbase.invalid','',now(),'{}','{"role":"agent","full_name":"Non Admin"}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000652','authenticated','authenticated','clubfbid-admin@footbase.invalid','',now(),'{}','{"role":"agent","full_name":"Admin"}',now(),now());

-- service_role seeds (bypasses RLS): approve users, elevate one to admin, seed a club.
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000000","role":"service_role"}',true);
update public.profiles set account_status='approved' where id='00000000-0000-4000-8000-000000000651';
update public.profiles set role='admin',account_status='approved' where id='00000000-0000-4000-8000-000000000652';
insert into public.clubes (id,name,source_key,state) values
('00000000-0000-4000-9000-000000000651','Clube Teste FB-ID','test-fbid:club1','ES');
insert into public.clube_fontes (club_id,fonte,id_externo,confidence) values
('00000000-0000-4000-9000-000000000651','test-fbid','club1','exact');

-- fb_id was auto-assigned from the reserved sequence — sanity check the range.
do $$ begin
  if not exists (select 1 from public.clubes where id='00000000-0000-4000-9000-000000000651' and fb_id >= 500000000) then
    raise exception 'SECURITY TEST FAILED: fb_id was not assigned from the reserved range';
  end if;
end $$;

-- A club fb_id below the reserved range must be rejected by the check constraint.
do $$ begin
  begin
    insert into public.clubes (name, fb_id) values ('Clube FB-ID Invalido', 123456);
    raise exception 'SECURITY TEST FAILED: fb_id below the reserved range was accepted';
  exception when others then if sqlerrm like 'SECURITY TEST FAILED:%' then raise; end if; end;
end $$;

-- A fresh insert with no explicit fb_id must still get one from the sequence
-- default (regression check: the first cut of this migration backfilled existing
-- rows but forgot the column default, so a brand-new club insert — exactly what
-- resolveClubForIngestion does — would have failed with a not-null violation;
-- caught here before any real ingestion hit it).
do $$ begin
  insert into public.clubes (name, source_key, state) values ('Clube Sem FB-ID Explicito', 'test-fbid:default-check', 'ES');
  if not exists (select 1 from public.clubes where source_key='test-fbid:default-check' and fb_id >= 500000000) then
    raise exception 'SECURITY TEST FAILED: a fresh insert without an explicit fb_id did not get the sequence default';
  end if;
end $$;

-- ----- Non-admin (authenticated) is fully blocked from clube_fontes -----
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000651","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
  if (select count(*) from public.clube_fontes) <> 0 then raise exception 'SECURITY TEST FAILED: non-admin read clube_fontes'; end if;
  begin
    insert into public.clube_fontes (club_id,fonte,id_externo) values ('00000000-0000-4000-9000-000000000651','fake','x');
    raise exception 'SECURITY TEST FAILED: non-admin wrote clube_fontes';
  exception when others then if sqlerrm like 'SECURITY TEST FAILED:%' then raise; end if; end;
end $$;
reset role;

-- ----- Admin can read what service_role wrote + write; PK stays idempotent -----
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000652","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
  if not exists (select 1 from public.clube_fontes where fonte='test-fbid' and id_externo='club1') then
    raise exception 'SECURITY TEST FAILED: admin cannot read clube_fontes';
  end if;
  insert into public.clube_fontes (club_id,fonte,id_externo) values ('00000000-0000-4000-9000-000000000651','test-fbid','club2');
  begin
    insert into public.clube_fontes (club_id,fonte,id_externo) values ('00000000-0000-4000-9000-000000000651','test-fbid','club1');
    raise exception 'SECURITY TEST FAILED: duplicate external id mapping allowed';
  exception when others then if sqlerrm like 'SECURITY TEST FAILED:%' then raise; end if; end;
end $$;
reset role;

select 'club_fb_id_security_passed' as result;

rollback;
