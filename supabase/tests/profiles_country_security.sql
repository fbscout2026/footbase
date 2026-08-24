-- País no cadastro (Session 57) — verifica: usuario comum PODE atualizar o próprio
-- country, continua SEM poder atualizar role/account_status (guarda de regressão da
-- allowlist). Rollback no final, sem resíduo.
begin;

insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000d01','authenticated','authenticated','country-test@footbase.invalid','',now(),'{}','{"role":"agent","full_name":"Country Test"}',now(),now());

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000000","role":"service_role"}',true);
update public.profiles set account_status='approved' where id='00000000-0000-4000-8000-000000000d01';

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000d01","role":"authenticated"}',true);
set local role authenticated;

do $$ begin
  if (select country from public.profiles where id='00000000-0000-4000-8000-000000000d01') is not null then
    raise exception 'SECURITY TEST FAILED: country did not default to NULL';
  end if;

  update public.profiles set country='BR' where id='00000000-0000-4000-8000-000000000d01';
  if (select country from public.profiles where id='00000000-0000-4000-8000-000000000d01') <> 'BR' then
    raise exception 'SECURITY TEST FAILED: self-update of country was rejected';
  end if;

  begin
    update public.profiles set role='admin' where id='00000000-0000-4000-8000-000000000d01';
    raise exception 'SECURITY TEST FAILED: non-admin edited role via the same trigger path';
  exception when others then if sqlerrm like 'SECURITY TEST FAILED:%' then raise; end if; end;

  begin
    update public.profiles set account_status='rejected' where id='00000000-0000-4000-8000-000000000d01';
    raise exception 'SECURITY TEST FAILED: non-admin edited account_status via the same trigger path';
  exception when others then if sqlerrm like 'SECURITY TEST FAILED:%' then raise; end if; end;
end $$;
reset role;

select 'profiles_country_security_passed' as result;

rollback;
-- end of test file
