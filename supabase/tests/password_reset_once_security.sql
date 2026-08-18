-- Redefinição de senha self-service, limite de uma vez por conta — verifica:
-- password_reset_used começa false; um usuário comum pode setá-lo de false para true
-- (a "conclusão" da redefinição); não pode setá-lo de volta para false (a real garantia
-- de "uma vez só" — o bloqueio do segundo uso em si é aplicado pela UI, que checa o
-- valor antes de mostrar o formulário); outros campos continuam protegidos pela mesma
-- allowlist de sempre. Rollback no final.
begin;

insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000a01','authenticated','authenticated','reset-once@footbase.invalid','',now(),'{}','{"role":"agent","full_name":"Reset Once"}',now(),now());

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000000","role":"service_role"}',true);
update public.profiles set account_status='approved' where id='00000000-0000-4000-8000-000000000a01';

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000a01","role":"authenticated"}',true);
set local role authenticated;

do $$ begin
  -- Starts false by default.
  if (select password_reset_used from public.profiles where id='00000000-0000-4000-8000-000000000a01') <> false then
    raise exception 'SECURITY TEST FAILED: password_reset_used did not default to false';
  end if;

  -- The user may still edit their own allowlisted fields alongside the flag flip.
  update public.profiles set full_name='Reset Once Updated', password_reset_used=true
  where id='00000000-0000-4000-8000-000000000a01';
  if (select password_reset_used from public.profiles where id='00000000-0000-4000-8000-000000000a01') <> true then
    raise exception 'SECURITY TEST FAILED: false->true flip was rejected';
  end if;

  -- Repeating true->true (idempotent no-op, e.g. a duplicate submit) stays harmless.
  update public.profiles set password_reset_used=true where id='00000000-0000-4000-8000-000000000a01';
  if (select password_reset_used from public.profiles where id='00000000-0000-4000-8000-000000000a01') <> true then
    raise exception 'SECURITY TEST FAILED: idempotent true->true update lost the flag';
  end if;

  -- Reverting true->false (self-unlocking another use) is rejected.
  begin
    update public.profiles set password_reset_used=false where id='00000000-0000-4000-8000-000000000a01';
    raise exception 'SECURITY TEST FAILED: user reverted password_reset_used back to false';
  exception when others then if sqlerrm like 'SECURITY TEST FAILED:%' then raise; end if; end;

  -- Unrelated column still blocked by the same allowlist (unchanged behavior).
  begin
    update public.profiles set role='admin' where id='00000000-0000-4000-8000-000000000a01';
    raise exception 'SECURITY TEST FAILED: non-admin edited role via the same trigger path';
  exception when others then if sqlerrm like 'SECURITY TEST FAILED:%' then raise; end if; end;
end $$;
reset role;

select 'password_reset_once_security_passed' as result;

rollback;
