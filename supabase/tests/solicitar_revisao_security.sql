-- Solicitar Revisão (Session 57, WS7) — verifica: (1) conta 'pending' chamando a RPC
-- solicitar_revisao_conta() é rejeitada (só 'rejected' pode pedir revisão); (2) conta
-- 'rejected' chamando a RPC volta para 'pending' e rejection_reason é limpo; (3) um
-- UPDATE direto de account_status (fora da RPC) continua bloqueado pelo guard trigger,
-- mesmo depois da RPC existir. Rollback no final, sem resíduo.
begin;

insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000e01','authenticated','authenticated','revisao-pending@footbase.invalid','',now(),'{}','{"role":"agent","full_name":"Revisao Pending"}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000e02','authenticated','authenticated','revisao-rejected@footbase.invalid','',now(),'{}','{"role":"agent","full_name":"Revisao Rejected"}',now(),now());

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000000","role":"service_role"}',true);
update public.profiles set account_status='pending' where id='00000000-0000-4000-8000-000000000e01';
update public.profiles set account_status='rejected', rejection_reason='Documento de comprovação ilegível, favor reenviar em melhor qualidade.' where id='00000000-0000-4000-8000-000000000e02';

-- (1) pending account cannot request review
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000e01","role":"authenticated"}',true);
set local role authenticated;

do $$ begin
  begin
    perform public.solicitar_revisao_conta();
    raise exception 'SECURITY TEST FAILED: pending account was allowed to request review';
  exception when others then if sqlerrm like 'SECURITY TEST FAILED:%' then raise; end if; end;
end $$;
reset role;

-- (2) rejected account requests review successfully
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000e02","role":"authenticated"}',true);
set local role authenticated;

do $$ begin
  perform public.solicitar_revisao_conta();
  if (select account_status from public.profiles where id='00000000-0000-4000-8000-000000000e02') <> 'pending' then
    raise exception 'SECURITY TEST FAILED: rejected account did not move to pending after requesting review';
  end if;
  if (select rejection_reason from public.profiles where id='00000000-0000-4000-8000-000000000e02') is not null then
    raise exception 'SECURITY TEST FAILED: rejection_reason was not cleared after requesting review';
  end if;

  -- (3) direct UPDATE of account_status is still blocked outside the RPC
  begin
    update public.profiles set account_status='approved' where id='00000000-0000-4000-8000-000000000e02';
    raise exception 'SECURITY TEST FAILED: non-admin edited account_status directly, bypassing the RPC';
  exception when others then if sqlerrm like 'SECURITY TEST FAILED:%' then raise; end if; end;
end $$;
reset role;

select 'solicitar_revisao_security_passed' as result;

rollback;
-- end of test file
