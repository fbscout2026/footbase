-- Fase 4.3 athlete claim authorization checks. Everything is rolled back.
begin;

insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000431','authenticated','authenticated','security-athlete-agent-one@footbase.invalid','',now(),'{}','{"role":"agent","full_name":"Agent One"}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000432','authenticated','authenticated','security-athlete-agent-two@footbase.invalid','',now(),'{}','{"role":"agent","full_name":"Agent Two"}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000433','authenticated','authenticated','security-athlete-unverified@footbase.invalid','',now(),'{}','{"role":"agent","full_name":"Unverified"}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000434','authenticated','authenticated','security-athlete-club@footbase.invalid','',now(),'{}','{"role":"club","full_name":"Club"}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000435','authenticated','authenticated','security-athlete-admin@footbase.invalid','',now(),'{}','{"role":"agent","full_name":"Admin"}',now(),now());

select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000000","role":"service_role"}',true);
update public.profiles set account_status='approved' where id in ('00000000-0000-4000-8000-000000000431','00000000-0000-4000-8000-000000000432','00000000-0000-4000-8000-000000000433','00000000-0000-4000-8000-000000000434');
update public.profiles set role='admin',account_status='approved' where id='00000000-0000-4000-8000-000000000435';
update public.agentes set verified_status='verified' where user_id in ('00000000-0000-4000-8000-000000000431','00000000-0000-4000-8000-000000000432');
insert into public.atletas (fb_id,name,birth_date,main_position) values
(9191919431,'Security Claim Athlete One','2008-01-01','CB'),
(9191919432,'Security Claim Athlete Two','2009-01-01','CM'),
(9191919433,'Security Claim Athlete Three','2010-01-01','ST');

-- Verified agent may request multiple different athletes.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000431',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000431","role":"authenticated"}',true);
set local role authenticated;
insert into public.solicitacoes_reivindicacao (tipo,fb_id_atleta,requested_by,documento_url,mensagem) values
('atleta',9191919431,'00000000-0000-4000-8000-000000000431','https://example.invalid/athlete-one','Official proof of representation for athlete one.'),
('atleta',9191919432,'00000000-0000-4000-8000-000000000431','https://example.invalid/athlete-two','Official proof of representation for athlete two.');
do $$ declare v_rows integer; begin
  if (select count(*) from public.atletas where fb_id in (9191919431,9191919432) and claim_status='pending' and agent_id is null) <> 2 then raise exception 'SECURITY TEST FAILED: requests did not mark athletes pending'; end if;
  update public.atletas set claim_status='claimed' where fb_id=9191919431;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'SECURITY TEST FAILED: agent changed claim status directly'; end if;
end $$;
reset role;

-- Another agent cannot read evidence or create a competing request.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000432',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000432","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
  if exists (select 1 from public.solicitacoes_reivindicacao where fb_id_atleta=9191919431) then raise exception 'SECURITY TEST FAILED: other agent read private evidence'; end if;
  begin insert into public.solicitacoes_reivindicacao (tipo,fb_id_atleta,requested_by,documento_url,mensagem) values ('atleta',9191919431,'00000000-0000-4000-8000-000000000432','https://example.invalid/competing','Competing representation request must be blocked.'); raise exception 'SECURITY TEST FAILED: competing request succeeded'; exception when others then if sqlerrm like 'SECURITY TEST FAILED:%' then raise; end if; end;
end $$;
reset role;

-- Unverified agent and club cannot claim an available athlete.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000433',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000433","role":"authenticated"}',true);
set local role authenticated;
do $$ begin begin insert into public.solicitacoes_reivindicacao (tipo,fb_id_atleta,requested_by,documento_url,mensagem) values ('atleta',9191919433,'00000000-0000-4000-8000-000000000433','https://example.invalid/unverified','Unverified agent must not claim this athlete.'); raise exception 'SECURITY TEST FAILED: unverified agent claim succeeded'; exception when others then if sqlerrm like 'SECURITY TEST FAILED:%' then raise; end if; end; end $$;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000434',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000434","role":"authenticated"}',true);
set local role authenticated;
do $$ begin begin insert into public.solicitacoes_reivindicacao (tipo,fb_id_atleta,requested_by,documento_url,mensagem) values ('atleta',9191919433,'00000000-0000-4000-8000-000000000434','https://example.invalid/club','Club account must not claim this athlete.'); raise exception 'SECURITY TEST FAILED: club claim succeeded'; exception when others then if sqlerrm like 'SECURITY TEST FAILED:%' then raise; end if; end; end $$;
reset role;

-- Admin rejection releases the athlete; the same agent may resubmit.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000435',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000435","role":"authenticated"}',true);
set local role authenticated;
update public.solicitacoes_reivindicacao set status='rejected' where fb_id_atleta=9191919432 and status='pending';
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000431',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000431","role":"authenticated"}',true);
set local role authenticated;
insert into public.solicitacoes_reivindicacao (tipo,fb_id_atleta,requested_by,documento_url,mensagem) values ('atleta',9191919432,'00000000-0000-4000-8000-000000000431','https://example.invalid/athlete-two-new','Updated official proof after the previous rejection.');
reset role;

-- Admin approval assigns the correct agent and evidence remains immutable.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000435',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000435","role":"authenticated"}',true);
set local role authenticated;
update public.solicitacoes_reivindicacao set status='approved' where fb_id_atleta=9191919431 and status='pending';
do $$ begin
  if not exists (select 1 from public.atletas at join public.agentes a on a.id=at.agent_id where at.fb_id=9191919431 and at.claim_status='claimed' and a.user_id='00000000-0000-4000-8000-000000000431') then raise exception 'SECURITY TEST FAILED: approval assigned wrong agent'; end if;
  begin update public.solicitacoes_reivindicacao set documento_url='https://example.invalid/tampered' where fb_id_atleta=9191919431; raise exception 'SECURITY TEST FAILED: evidence was changed'; exception when others then if sqlerrm like 'SECURITY TEST FAILED:%' then raise; end if; end;
end $$;
reset role;

-- Represented athlete rejects new requests.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000432',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000432","role":"authenticated"}',true);
set local role authenticated;
do $$ begin begin insert into public.solicitacoes_reivindicacao (tipo,fb_id_atleta,requested_by,documento_url,mensagem) values ('atleta',9191919431,'00000000-0000-4000-8000-000000000432','https://example.invalid/already-claimed','A represented athlete cannot accept a new request.'); raise exception 'SECURITY TEST FAILED: represented athlete accepted claim'; exception when others then if sqlerrm like 'SECURITY TEST FAILED:%' then raise; end if; end; end $$;
reset role;

select 'athlete_claim_security_passed' as result;
rollback;
