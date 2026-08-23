-- Login único por dispositivo (Session 57) — verifica: um usuário comum PODE atualizar
-- o próprio active_session_id (o passo que LoginForm/completePasswordReset fazem a cada
-- login), continua SEM poder atualizar role via o mesmo caminho (guarda de regressão da
-- allowlist já testada em password_reset_once_security.sql), e admin/service_role
-- continuam irrestritos. Rollback no final, sem resíduo.
begin;

insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000b01','authenticated','authenticated','single-device@footbase.invalid','',now(),'{}','{"role":"agent","full_name":"Single Device"}',now(),now());

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000000","role":"service_role"}',true);
update public.profiles set account_status='approved' where id='00000000-0000-4000-8000-000000000b01';

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000b01","role":"authenticated"}',true);
set local role authenticated;

do $$ begin
  -- Starts unset (NULL) — no device has ever claimed this account under the new system.
  if (select active_session_id from public.profiles where id='00000000-0000-4000-8000-000000000b01') is not null then
    raise exception 'SECURITY TEST FAILED: active_session_id did not default to NULL';
  end if;

  -- The user may self-claim a device session id (what a real login does).
  update public.profiles set active_session_id='11111111-1111-4111-8111-111111111111'
  where id='00000000-0000-4000-8000-000000000b01';
  if (select active_session_id from public.profiles where id='00000000-0000-4000-8000-000000000b01') <> '11111111-1111-4111-8111-111111111111' then
    raise exception 'SECURITY TEST FAILED: self-claim of active_session_id was rejected';
  end if;

  -- A second login (new device) may overwrite it — last-write-wins is the whole point.
  update public.profiles set active_session_id='22222222-2222-4222-8222-222222222222'
  where id='00000000-0000-4000-8000-000000000b01';
  if (select active_session_id from public.profiles where id='00000000-0000-4000-8000-000000000b01') <> '22222222-2222-4222-8222-222222222222' then
    raise exception 'SECURITY TEST FAILED: re-claiming active_session_id (new device login) was rejected';
  end if;

  -- Unrelated column still blocked by the same allowlist (unchanged behavior — same
  -- regression guard as password_reset_once_security.sql).
  begin
    update public.profiles set role='admin' where id='00000000-0000-4000-8000-000000000b01';
    raise exception 'SECURITY TEST FAILED: non-admin edited role via the same trigger path';
  exception when others then if sqlerrm like 'SECURITY TEST FAILED:%' then raise; end if; end;
end $$;
reset role;

-- Admin/service_role stay unrestricted (unchanged behavior).
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000000","role":"service_role"}',true);
update public.profiles set active_session_id=null where id='00000000-0000-4000-8000-000000000b01';
do $$ begin
  if (select active_session_id from public.profiles where id='00000000-0000-4000-8000-000000000b01') is not null then
    raise exception 'SECURITY TEST FAILED: service_role could not clear active_session_id';
  end if;
end $$;

select 'single_device_session_security_passed' as result;

rollback;
