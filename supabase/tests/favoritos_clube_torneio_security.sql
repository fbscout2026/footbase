-- Favoritar clube/torneio (Session 57) — verifica: um usuário aprovado pode
-- favoritar/desfavoritar seu próprio clube/torneio; NÃO consegue ver/apagar o
-- favorito de outro usuário; admin vê tudo. Rollback no final, sem resíduo.
begin;

insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000c01','authenticated','authenticated','fav-clube-a@footbase.invalid','',now(),'{}','{"role":"agent","full_name":"Fav A"}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000c02','authenticated','authenticated','fav-clube-b@footbase.invalid','',now(),'{}','{"role":"agent","full_name":"Fav B"}',now(),now());

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000000","role":"service_role"}',true);
update public.profiles set account_status='approved' where id in ('00000000-0000-4000-8000-000000000c01','00000000-0000-4000-8000-000000000c02');

insert into public.clubes (id, name, state, federacao) values
('00000000-0000-4000-9000-000000000c01', 'Clube Teste Favoritos', 'RJ', 'FERJ');
insert into public.torneios (id, name, federation, category, year) values
('00000000-0000-4000-9000-000000000c02', 'Torneio Teste Favoritos', 'FERJ', 'SUB-17', 2026);

-- User A: can favorite/unfavorite their own club + tournament.
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000c01","role":"authenticated"}',true);
set local role authenticated;

do $$ begin
  insert into public.favoritos_clube (user_id, club_id) values ('00000000-0000-4000-8000-000000000c01','00000000-0000-4000-9000-000000000c01');
  insert into public.favoritos_torneio (user_id, torneio_id) values ('00000000-0000-4000-8000-000000000c01','00000000-0000-4000-9000-000000000c02');
  if (select count(*) from public.favoritos_clube where user_id='00000000-0000-4000-8000-000000000c01') <> 1 then
    raise exception 'SECURITY TEST FAILED: user A could not favorite their own club';
  end if;
  if (select count(*) from public.favoritos_torneio where user_id='00000000-0000-4000-8000-000000000c01') <> 1 then
    raise exception 'SECURITY TEST FAILED: user A could not favorite their own tournament';
  end if;

  delete from public.favoritos_clube where user_id='00000000-0000-4000-8000-000000000c01' and club_id='00000000-0000-4000-9000-000000000c01';
  if (select count(*) from public.favoritos_clube where user_id='00000000-0000-4000-8000-000000000c01') <> 0 then
    raise exception 'SECURITY TEST FAILED: user A could not unfavorite their own club';
  end if;

  -- re-favorite for the next checks below
  insert into public.favoritos_clube (user_id, club_id) values ('00000000-0000-4000-8000-000000000c01','00000000-0000-4000-9000-000000000c01');
end $$;
reset role;

-- User B: cannot see or delete user A's favorites (RLS scoping, not just app-level filtering).
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000c02","role":"authenticated"}',true);
set local role authenticated;

do $$ begin
  if (select count(*) from public.favoritos_clube where user_id='00000000-0000-4000-8000-000000000c01') <> 0 then
    raise exception 'SECURITY TEST FAILED: user B could see user A''s club favorite';
  end if;
  if (select count(*) from public.favoritos_torneio where user_id='00000000-0000-4000-8000-000000000c01') <> 0 then
    raise exception 'SECURITY TEST FAILED: user B could see user A''s tournament favorite';
  end if;

  -- User B's DELETE is scoped by RLS's USING clause, not by whether B can SEE the
  -- row first (RLS SELECT already blocks that, confirmed above) — a DELETE whose
  -- WHERE matches zero RLS-visible rows just silently affects 0 rows, no error. The
  -- only way to actually confirm the row survived is a context that CAN see it
  -- (admin, below) — checking again as user B would always read 0 regardless of
  -- whether the delete had any real effect, which isn't a real check.
  delete from public.favoritos_clube where user_id='00000000-0000-4000-8000-000000000c01';
end $$;
reset role;

-- Admin sees everything (oversight), unrestricted — and this is the real proof that
-- user B's delete attempt above had zero effect on user A's row.
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000000","role":"service_role"}',true);
do $$ begin
  if (select count(*) from public.favoritos_clube where user_id='00000000-0000-4000-8000-000000000c01' and club_id='00000000-0000-4000-9000-000000000c01') <> 1 then
    raise exception 'SECURITY TEST FAILED: user B''s delete attempt actually removed user A''s club favorite';
  end if;
end $$;

select 'favoritos_clube_torneio_security_passed' as result;

rollback;
-- end of test file
