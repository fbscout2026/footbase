-- Aba Torneios — hierarquia confederacoes/paises/federacoes + torneios.federacao_id.
-- Verifica: seed presente (6 confederacoes, Brasil, CBF/FPF/FERJ/FMF), leitura
-- liberada para aprovado/admin, escrita bloqueada para não-admin e liberada para
-- admin, FK de torneios.federacao_id funcional. Rollback no final.
begin;

insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000801','authenticated','authenticated','trn-approved@footbase.invalid','',now(),'{}','{"role":"agent","full_name":"Approved"}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000802','authenticated','authenticated','trn-admin@footbase.invalid','',now(),'{}','{"role":"agent","full_name":"Admin"}',now(),now());

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000000","role":"service_role"}',true);
update public.profiles set account_status='approved' where id='00000000-0000-4000-8000-000000000801';
update public.profiles set role='admin', account_status='approved' where id='00000000-0000-4000-8000-000000000802';

do $$ begin
  -- Seed already applied by the migration — sanity-check it here too.
  if (select count(*) from public.confederacoes) < 6 then raise exception 'SECURITY TEST FAILED: confederacoes seed missing'; end if;
  if not exists (select 1 from public.paises where nome='Brasil') then raise exception 'SECURITY TEST FAILED: Brasil not seeded'; end if;
  if (select count(*) from public.federacoes f join public.paises p on p.id=f.pais_id where p.nome='Brasil') < 4 then
    raise exception 'SECURITY TEST FAILED: Brasil federations seed missing';
  end if;
  if not exists (select 1 from public.federacoes f join public.paises p on p.id=f.pais_id where p.nome='Brasil' and f.sigla='CBF' and f.tipo='nacional') then
    raise exception 'SECURITY TEST FAILED: CBF nacional missing';
  end if;
end $$;

-- ----- Approved (non-admin): can read, cannot write -----
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000801","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
  if (select count(*) from public.confederacoes) < 6 then raise exception 'SECURITY TEST FAILED: approved cannot read confederacoes'; end if;
  if (select count(*) from public.paises) < 1 then raise exception 'SECURITY TEST FAILED: approved cannot read paises'; end if;
  if (select count(*) from public.federacoes) < 4 then raise exception 'SECURITY TEST FAILED: approved cannot read federacoes'; end if;
  begin
    insert into public.confederacoes (continente,codigo,nome) values ('X','XXX','X');
    raise exception 'SECURITY TEST FAILED: approved wrote confederacoes';
  exception when others then if sqlerrm like 'SECURITY TEST FAILED:%' then raise; end if; end;
end $$;
reset role;

-- ----- Admin: can write; torneios.federacao_id FK works -----
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000802","role":"authenticated"}',true);
set local role authenticated;
do $$
declare v_fed uuid;
begin
  select f.id into v_fed from public.federacoes f join public.paises p on p.id=f.pais_id where p.nome='Brasil' and f.sigla='FPF';
  insert into public.torneios (name, federation, federacao_id, category, year)
  values ('Copa Teste Torneios', 'FPF', v_fed, 'SUB-17', 2026);
  if not exists (select 1 from public.torneios where name='Copa Teste Torneios' and federacao_id=v_fed) then
    raise exception 'SECURITY TEST FAILED: torneio with federacao_id not inserted correctly';
  end if;
end $$;
reset role;

select 'torneios_hierarchy_security_passed' as result;

rollback;
