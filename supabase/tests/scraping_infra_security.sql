-- Fase 6.4 — scraping_jobs (fila de retry) + atleta_fontes (identidade multi-fonte).
-- Verifica: RLS admin-only (não-admin não lê nem escreve), admin/service_role escrevem,
-- idempotência do job (unique source+job_type+ref), FK do mapa ao atleta e PK
-- (fonte,id_externo) única. Troca de papel no nível superior (padrão dos testes que
-- já passaram). Tudo revertido no rollback.
begin;

insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000641','authenticated','authenticated','infra-nonadmin@footbase.invalid','',now(),'{}','{"role":"agent","full_name":"Non Admin"}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000642','authenticated','authenticated','infra-admin@footbase.invalid','',now(),'{}','{"role":"agent","full_name":"Admin"}',now(),now());

-- service_role seeds (bypasses RLS): approve users, elevate one to admin, seed an atleta + rows.
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000000","role":"service_role"}',true);
update public.profiles set account_status='approved' where id='00000000-0000-4000-8000-000000000641';
update public.profiles set role='admin',account_status='approved' where id='00000000-0000-4000-8000-000000000642';
insert into public.atletas (bid,name,birth_date,main_position,current_category) values
(9696960641,'Infra Test Athlete','2008-05-01','GK','SUB-17');
insert into public.scraping_jobs (source,job_type,ref,payload) values ('CBF','sumula','5642183','{"ano":2026}');
insert into public.atleta_fontes (bid,fonte,id_externo,confidence) values (9696960641,'cbf','9696960641','exact');

-- ----- Non-admin (authenticated) is fully blocked -----
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000641","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
  if (select count(*) from public.scraping_jobs) <> 0 then raise exception 'SECURITY TEST FAILED: non-admin read scraping_jobs'; end if;
  if (select count(*) from public.atleta_fontes) <> 0 then raise exception 'SECURITY TEST FAILED: non-admin read atleta_fontes'; end if;
  begin
    insert into public.scraping_jobs (source,job_type,ref) values ('CBF','profile','111111');
    raise exception 'SECURITY TEST FAILED: non-admin wrote scraping_jobs';
  exception when others then if sqlerrm like 'SECURITY TEST FAILED:%' then raise; end if; end;
  begin
    insert into public.atleta_fontes (bid,fonte,id_externo) values (9696960641,'fpf','abc');
    raise exception 'SECURITY TEST FAILED: non-admin wrote atleta_fontes';
  exception when others then if sqlerrm like 'SECURITY TEST FAILED:%' then raise; end if; end;
end $$;
reset role;

-- ----- Admin can read what service_role wrote + write; keys stay idempotent -----
-- NOTE: checks the SPECIFIC seeded row exists, not a raw `count(*) = 1` — the real
-- table is no longer empty once live ingestion has run (confirmed live, Session 50:
-- 520 pre-existing scraping_jobs rows from earlier dry-runs made the old absolute-
-- count assertion misfire as a false "admin cannot read" failure even though RLS was
-- working correctly). `exists(...)` is immune to how many OTHER rows the table holds.
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000642","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
  if not exists (select 1 from public.scraping_jobs where source='CBF' and job_type='sumula' and ref='5642183') then
    raise exception 'SECURITY TEST FAILED: admin cannot read scraping_jobs';
  end if;
  if not exists (select 1 from public.atleta_fontes where fonte='cbf' and id_externo='9696960641') then
    raise exception 'SECURITY TEST FAILED: admin cannot read atleta_fontes';
  end if;
  insert into public.scraping_jobs (source,job_type,ref) values ('FPF','sumula','778899');
  begin
    insert into public.scraping_jobs (source,job_type,ref) values ('CBF','sumula','5642183');
    raise exception 'SECURITY TEST FAILED: duplicate job was allowed';
  exception when others then if sqlerrm like 'SECURITY TEST FAILED:%' then raise; end if; end;
  begin
    insert into public.atleta_fontes (bid,fonte,id_externo) values (9696960641,'cbf','9696960641');
    raise exception 'SECURITY TEST FAILED: duplicate external id mapping allowed';
  exception when others then if sqlerrm like 'SECURITY TEST FAILED:%' then raise; end if; end;
end $$;
reset role;

select 'scraping_infra_security_passed' as result;

rollback;
