-- Promoção de usuário a admin — verifica: só admin promove; alvo precisa estar
-- aprovado; não pode promover quem já é admin; não pode se auto-promover;
-- promoção válida atualiza profiles.role e grava histórico atomicamente;
-- não-admin não lê o histórico; tabela imutável (update direto = 0 linhas).
-- Rollback no final.
begin;

insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000901','authenticated','authenticated','promo-admin@footbase.invalid','',now(),'{}','{"role":"agent","full_name":"Admin"}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000902','authenticated','authenticated','promo-approved@footbase.invalid','',now(),'{}','{"role":"agent","full_name":"Approved"}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000903','authenticated','authenticated','promo-pending@footbase.invalid','',now(),'{}','{"role":"agent","full_name":"Pending"}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000904','authenticated','authenticated','promo-nonadmin@footbase.invalid','',now(),'{}','{"role":"agent","full_name":"NonAdmin"}',now(),now());

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000000","role":"service_role"}',true);
update public.profiles set role='admin', account_status='approved' where id='00000000-0000-4000-8000-000000000901';
update public.profiles set account_status='approved' where id in ('00000000-0000-4000-8000-000000000902','00000000-0000-4000-8000-000000000904');
-- 903 stays 'pending' (default account_status) on purpose.

-- ----- Non-admin: cannot promote, cannot read history -----
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000904","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
  begin
    perform admin_promover_para_admin('00000000-0000-4000-8000-000000000902','Justificativa suficientemente longa para passar na validacao.');
    raise exception 'SECURITY TEST FAILED: non-admin promoted a user';
  exception when others then if sqlerrm like 'SECURITY TEST FAILED:%' then raise; end if; end;
  if (select count(*) from public.admin_promocoes) <> 0 then raise exception 'SECURITY TEST FAILED: non-admin read promotion history'; end if;
end $$;
reset role;

-- ----- Admin: validations reject bad input before any write -----
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000901","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
  -- target not approved (pending).
  begin
    perform admin_promover_para_admin('00000000-0000-4000-8000-000000000903','Justificativa suficientemente longa para passar na validacao.');
    raise exception 'SECURITY TEST FAILED: promoted a non-approved user';
  exception when others then if sqlerrm like 'SECURITY TEST FAILED:%' then raise; end if; end;
  -- target already admin.
  begin
    perform admin_promover_para_admin('00000000-0000-4000-8000-000000000901','Justificativa suficientemente longa para passar na validacao.');
    raise exception 'SECURITY TEST FAILED: promoted an already-admin user (or self)';
  exception when others then if sqlerrm like 'SECURITY TEST FAILED:%' then raise; end if; end;
  -- self-promotion explicitly rejected even before the "already admin" check matters.
  begin
    perform admin_promover_para_admin(auth.uid(),'Justificativa suficientemente longa para passar na validacao.');
    raise exception 'SECURITY TEST FAILED: self-promotion allowed';
  exception when others then if sqlerrm like 'SECURITY TEST FAILED:%' then raise; end if; end;
end $$;

-- ----- Admin: a valid promotion succeeds atomically -----
select admin_promover_para_admin('00000000-0000-4000-8000-000000000902','Usuario validado presencialmente e assume funcoes de curadoria administrativa.');

do $$ begin
  if not exists (select 1 from public.profiles where id='00000000-0000-4000-8000-000000000902' and role='admin') then
    raise exception 'SECURITY TEST FAILED: profiles.role was not updated to admin';
  end if;
  if not exists (
    select 1 from public.admin_promocoes
    where user_id='00000000-0000-4000-8000-000000000902' and promovido_por='00000000-0000-4000-8000-000000000901'
  ) then raise exception 'SECURITY TEST FAILED: promotion history was not recorded correctly'; end if;

  -- Immutability: no update/delete policy exists for authenticated (even admin).
  update public.admin_promocoes set justificativa='hacked' where user_id='00000000-0000-4000-8000-000000000902';
  if found then raise exception 'SECURITY TEST FAILED: history row was updated directly'; end if;
end $$;
reset role;

select 'admin_promotions_security_passed' as result;

rollback;
