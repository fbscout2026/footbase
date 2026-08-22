-- Phase 4.4 (read-only revision) claimed-club panel authorization checks.
-- Model: categories/tournaments/roster are captured from súmulas (service_role)
-- or curated by admin — the club does NOT declare them. The club may edit its
-- operational profile and SUGGEST institutional corrections (including crest).
-- All data is rolled back.
begin;

insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000441','authenticated','authenticated','panel-owner@footbase.invalid','',now(),'{}','{"role":"club","full_name":"Panel Owner"}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000442','authenticated','authenticated','panel-other@footbase.invalid','',now(),'{}','{"role":"club","full_name":"Other Club"}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000443','authenticated','authenticated','panel-agent@footbase.invalid','',now(),'{}','{"role":"agent","full_name":"Agent"}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000444','authenticated','authenticated','panel-admin@footbase.invalid','',now(),'{}','{"role":"agent","full_name":"Admin"}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000445','authenticated','authenticated','panel-claimant@footbase.invalid','',now(),'{}','{"role":"club","full_name":"Claimant"}',now(),now());

select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000000","role":"service_role"}',true);
update public.profiles set account_status='approved' where id in ('00000000-0000-4000-8000-000000000441','00000000-0000-4000-8000-000000000442','00000000-0000-4000-8000-000000000443','00000000-0000-4000-8000-000000000445');
update public.profiles set role='admin',account_status='approved' where id='00000000-0000-4000-8000-000000000444';
insert into public.clubes (id,name,source_key,state,federacao,reivindicado_por,claim_status) values
('00000000-0000-4000-8000-000000004401','Panel Security Owner','test:panel-owner','SP','FPF','00000000-0000-4000-8000-000000000441','claimed'),
('00000000-0000-4000-8000-000000004402','Panel Security Other','test:panel-other','RJ','FERJ','00000000-0000-4000-8000-000000000442','claimed'),
('00000000-0000-4000-8000-000000004403','Panel Claimable','test:panel-claim','MG','FMF',null,'unclaimed');
insert into public.atletas (fb_id,name,birth_date,main_position,current_club_id,current_category) values
(9191919441,'Panel Security Athlete','2009-01-01','CM','00000000-0000-4000-8000-000000004402','SUB-17');

-- Ingestion/admin seeds a category + tournament for the owner club (clubs cannot).
insert into public.club_categorias (id,club_id,category,status,display_order,source_status,declared_by)
values ('00000000-0000-4000-8000-0000000000c1','00000000-0000-4000-8000-000000004401','SUB-17','active',1,'official_confirmed','00000000-0000-4000-8000-000000000444');
insert into public.club_categoria_torneios (club_category_id,declared_name,season,status,source_status,declared_by)
values ('00000000-0000-4000-8000-0000000000c1','Copa Oficial','2026','in_progress','official_confirmed','00000000-0000-4000-8000-000000000444');

-- Owner: may edit operational profile + suggest corrections; may NOT declare.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000441',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000441","role":"authenticated"}',true);
set local role authenticated;
update public.clubes set display_name='Panel FC',headquarters_city='Sao Paulo',headquarters_state='SP' where id='00000000-0000-4000-8000-000000004401';
insert into public.club_correction_requests (club_id,field_name,suggested_value,reason,requested_by)
values ('00000000-0000-4000-8000-000000004401','name','Panel FC Oficial','Documento institucional demonstra o nome oficial correto e completo.','00000000-0000-4000-8000-000000000441');
insert into public.club_correction_requests (club_id,field_name,suggested_value,reason,requested_by)
values ('00000000-0000-4000-8000-000000004401','crest','https://example.org/escudo-atualizado.webp','Temos uma versao oficial atualizada do escudo para analise.','00000000-0000-4000-8000-000000000441');
insert into public.favoritos (user_id,fb_id_atleta,nota,notas) values ('00000000-0000-4000-8000-000000000441',9191919441,80,'Privado');

do $$ begin
  -- Owner can READ the ingested category (read-only panel).
  if not exists (select 1 from public.club_categorias where club_id='00000000-0000-4000-8000-000000004401' and source_status='official_confirmed') then raise exception 'SECURITY TEST FAILED: owner cannot read ingested category'; end if;
  -- Name correction created with current value captured by the trigger.
  if not exists (select 1 from public.club_correction_requests where field_name='name' and current_value='Panel Security Owner' and requested_by='00000000-0000-4000-8000-000000000441') then raise exception 'SECURITY TEST FAILED: name correction current value not captured'; end if;
  -- Crest correction is accepted (club may suggest a different crest).
  if not exists (select 1 from public.club_correction_requests where field_name='crest' and requested_by='00000000-0000-4000-8000-000000000441') then raise exception 'SECURITY TEST FAILED: crest correction not accepted'; end if;
  -- Owner may NOT declare a category (write is admin/service_role only).
  begin insert into public.club_categorias (club_id,category,status,display_order,declared_by) values ('00000000-0000-4000-8000-000000004401','SUB-15','active',5,'00000000-0000-4000-8000-000000000441'); raise exception 'SECURITY TEST FAILED: owner declared a category'; exception when others then if sqlerrm like 'SECURITY TEST FAILED:%' then raise; end if; end;
  -- Owner may NOT file a roster request.
  begin insert into public.club_elenco_solicitacoes (club_id,fb_id_atleta,action,proposed_category,justification,requested_by) values ('00000000-0000-4000-8000-000000004401',9191919441,'add','SUB-17','Documentacao oficial apresentada para analise do vinculo institucional.','00000000-0000-4000-8000-000000000441'); raise exception 'SECURITY TEST FAILED: owner filed a roster request'; exception when others then if sqlerrm like 'SECURITY TEST FAILED:%' then raise; end if; end;
  -- Owner may NOT change the official name (guard trigger raises).
  begin update public.clubes set name='Hostile rename' where id='00000000-0000-4000-8000-000000004401'; raise exception 'SECURITY TEST FAILED: owner changed official name'; exception when others then if sqlerrm like 'SECURITY TEST FAILED:%' then raise; end if; end;
end $$;
reset role;

-- Regression: the operational-update guard must NOT block the Phase 4.2 club-claim
-- submission trigger (nested update at trigger depth > 1).
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000445',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000445","role":"authenticated"}',true);
set local role authenticated;
insert into public.solicitacoes_reivindicacao (tipo,clube_id,requested_by,documento_url,mensagem)
values ('clube','00000000-0000-4000-8000-000000004403','00000000-0000-4000-8000-000000000445','https://example.org/comprovacao.pdf','Comprovacao oficial do vinculo institucional apresentada para analise.');
do $$ begin
  if not exists (select 1 from public.clubes where id='00000000-0000-4000-8000-000000004403' and claim_status='pending') then
    raise exception 'SECURITY TEST FAILED: operational guard blocked the club-claim submission trigger';
  end if;
end $$;
reset role;

-- Another club cannot observe or mutate owner-private rows.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000442',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000442","role":"authenticated"}',true);
set local role authenticated;
do $$ declare v_rows integer; begin
  if exists (select 1 from public.club_correction_requests where club_id='00000000-0000-4000-8000-000000004401') then raise exception 'SECURITY TEST FAILED: other club read correction evidence'; end if;
  if exists (select 1 from public.favoritos where user_id='00000000-0000-4000-8000-000000000441') then raise exception 'SECURITY TEST FAILED: other club read favorites'; end if;
  update public.clubes set display_name='Hostile' where id='00000000-0000-4000-8000-000000004401'; get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'SECURITY TEST FAILED: other club updated profile'; end if;
end $$;
reset role;

-- An agent cannot read club declarations.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000443',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000443","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
  if exists (select 1 from public.club_categorias) then raise exception 'SECURITY TEST FAILED: agent read club declarations'; end if;
end $$;
reset role;

-- Admin supervision reads all panel records (both corrections here).
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000444',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000444","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
  if (select count(*) from public.club_correction_requests where club_id='00000000-0000-4000-8000-000000004401') <> 2 then raise exception 'SECURITY TEST FAILED: admin supervision cannot read corrections'; end if;
end $$;
reset role;

select 'club_panel_security_passed' as result;
rollback;
