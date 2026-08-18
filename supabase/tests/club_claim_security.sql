-- Fase 4.2 club claim authorization checks. All synthetic data is rolled back.
begin;

insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000421','authenticated','authenticated','security-club-one@footbase.invalid','',now(),'{}','{"role":"club","full_name":"Club One"}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000422','authenticated','authenticated','security-club-two@footbase.invalid','',now(),'{}','{"role":"club","full_name":"Club Two"}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000423','authenticated','authenticated','security-agent@footbase.invalid','',now(),'{}','{"role":"agent","full_name":"Agent"}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000424','authenticated','authenticated','security-admin@footbase.invalid','',now(),'{}','{"role":"agent","full_name":"Admin"}',now(),now());

select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000000","role":"service_role"}',true);
update public.profiles set account_status='approved' where id in ('00000000-0000-4000-8000-000000000421','00000000-0000-4000-8000-000000000422','00000000-0000-4000-8000-000000000423');
update public.profiles set role='admin',account_status='approved' where id='00000000-0000-4000-8000-000000000424';
insert into public.clubes (id,name,source_key,state,federacao) values
('00000000-0000-4000-8000-000000004201','Security Club Target One','security-club-target-one','SP','FPF'),
('00000000-0000-4000-8000-000000004202','Security Club Target Two','security-club-target-two','RJ','FERJ');

-- Approved club account can create exactly one pending request.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000421',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000421","role":"authenticated"}',true);
set local role authenticated;
insert into public.solicitacoes_reivindicacao (tipo,clube_id,requested_by,documento_url,mensagem)
values ('clube','00000000-0000-4000-8000-000000004201','00000000-0000-4000-8000-000000000421','https://example.invalid/proof-one','Official security test proof for club ownership.');
do $$ begin
  if (select claim_status from public.clubes where id='00000000-0000-4000-8000-000000004201') <> 'pending' then raise exception 'SECURITY TEST FAILED: target was not marked pending'; end if;
  begin
    insert into public.solicitacoes_reivindicacao (tipo,clube_id,requested_by,documento_url,mensagem) values ('clube','00000000-0000-4000-8000-000000004202','00000000-0000-4000-8000-000000000421','https://example.invalid/proof-two','A second pending claim must never be accepted.');
    raise exception 'SECURITY TEST FAILED: requester created a second pending claim';
  exception when others then if sqlerrm like 'SECURITY TEST FAILED:%' then raise; end if; end;
end $$;
reset role;

-- Another club cannot see private proof and cannot claim a pending target.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000422',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000422","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
  if exists (select 1 from public.solicitacoes_reivindicacao where clube_id='00000000-0000-4000-8000-000000004201') then raise exception 'SECURITY TEST FAILED: other club read private evidence'; end if;
  begin
    insert into public.solicitacoes_reivindicacao (tipo,clube_id,requested_by,documento_url,mensagem) values ('clube','00000000-0000-4000-8000-000000004201','00000000-0000-4000-8000-000000000422','https://example.invalid/hostile','Competing claim against a pending club must fail.');
    raise exception 'SECURITY TEST FAILED: pending target accepted another claimant';
  exception when others then if sqlerrm like 'SECURITY TEST FAILED:%' then raise; end if; end;
end $$;
reset role;

-- Agent accounts cannot claim clubs.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000423',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000423","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
  begin
    insert into public.solicitacoes_reivindicacao (tipo,clube_id,requested_by,documento_url,mensagem) values ('clube','00000000-0000-4000-8000-000000004202','00000000-0000-4000-8000-000000000423','https://example.invalid/agent','Agent profile must not claim a club identity.');
    raise exception 'SECURITY TEST FAILED: agent claimed a club';
  exception when others then if sqlerrm like 'SECURITY TEST FAILED:%' then raise; end if; end;
end $$;
reset role;

-- Admin approval atomically assigns ownership; evidence remains immutable.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000424',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000424","role":"authenticated"}',true);
set local role authenticated;
update public.solicitacoes_reivindicacao set status='approved' where clube_id='00000000-0000-4000-8000-000000004201';
do $$ begin
  if not exists (select 1 from public.clubes where id='00000000-0000-4000-8000-000000004201' and claim_status='claimed' and reivindicado_por='00000000-0000-4000-8000-000000000421') then raise exception 'SECURITY TEST FAILED: approval did not assign owner'; end if;
  begin
    update public.solicitacoes_reivindicacao set documento_url='https://example.invalid/tampered' where clube_id='00000000-0000-4000-8000-000000004201';
    raise exception 'SECURITY TEST FAILED: immutable proof was changed';
  exception when others then if sqlerrm like 'SECURITY TEST FAILED:%' then raise; end if; end;
end $$;
reset role;

select 'club_claim_security_passed' as result;
rollback;
