-- FOOTBASE Fase 3.6 — favoritos + prancheta persistidos no Supabase.
-- Idempotent bootstrap: safe to re-run from the SQL editor.

begin;

-- ---------------------------------------------------------------------------
-- Club identity for future scraper upserts.
-- ---------------------------------------------------------------------------
alter table public.clubes add column if not exists source_key text;
alter table public.prancheta_tatica
  add column if not exists lineup_initialized boolean not null default false;
create unique index if not exists idx_clubes_source_key
  on public.clubes (source_key)
  where source_key is not null;

-- One tactical board per user.
create unique index if not exists idx_prancheta_one_per_user
  on public.prancheta_tatica (user_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'prancheta_formation_valid'
      and conrelid = 'public.prancheta_tatica'::regclass
  ) then
    alter table public.prancheta_tatica
      add constraint prancheta_formation_valid
      check (formation in ('4-3-3', '4-4-2', '3-5-2', '4-2-3-1'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'prancheta_slot_position_valid'
      and conrelid = 'public.prancheta_slots'::regclass
  ) then
    alter table public.prancheta_slots
      add constraint prancheta_slot_position_valid check (
        (slot_type = 'starter'
          and position_code in ('GK','CB','LB','RB','DM','CM','AM','LW','RW','ST'))
        or (slot_type = 'bench' and position_code is null)
      );
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- RLS: private, approved-user data. Admin retains inspection access.
-- ---------------------------------------------------------------------------
drop policy if exists favoritos_owner_all on public.favoritos;
drop policy if exists favoritos_owner_select on public.favoritos;
drop policy if exists favoritos_owner_insert on public.favoritos;
drop policy if exists favoritos_owner_update on public.favoritos;
drop policy if exists favoritos_owner_delete on public.favoritos;

create policy favoritos_owner_select on public.favoritos
  for select to authenticated
  using (
    ((select auth.uid()) = user_id and private.is_approved())
    or private.is_admin()
  );
create policy favoritos_owner_insert on public.favoritos
  for insert to authenticated
  with check (
    ((select auth.uid()) = user_id and private.is_approved())
    or private.is_admin()
  );
create policy favoritos_owner_update on public.favoritos
  for update to authenticated
  using (
    ((select auth.uid()) = user_id and private.is_approved())
    or private.is_admin()
  )
  with check (
    ((select auth.uid()) = user_id and private.is_approved())
    or private.is_admin()
  );
create policy favoritos_owner_delete on public.favoritos
  for delete to authenticated
  using (
    ((select auth.uid()) = user_id and private.is_approved())
    or private.is_admin()
  );

drop policy if exists prancheta_owner_all on public.prancheta_tatica;
drop policy if exists prancheta_owner_select on public.prancheta_tatica;
drop policy if exists prancheta_owner_insert on public.prancheta_tatica;
drop policy if exists prancheta_owner_update on public.prancheta_tatica;
drop policy if exists prancheta_owner_delete on public.prancheta_tatica;

create policy prancheta_owner_select on public.prancheta_tatica
  for select to authenticated
  using (
    ((select auth.uid()) = user_id and private.is_approved())
    or private.is_admin()
  );
create policy prancheta_owner_insert on public.prancheta_tatica
  for insert to authenticated
  with check (
    ((select auth.uid()) = user_id and private.is_approved())
    or private.is_admin()
  );
create policy prancheta_owner_update on public.prancheta_tatica
  for update to authenticated
  using (
    ((select auth.uid()) = user_id and private.is_approved())
    or private.is_admin()
  )
  with check (
    ((select auth.uid()) = user_id and private.is_approved())
    or private.is_admin()
  );
create policy prancheta_owner_delete on public.prancheta_tatica
  for delete to authenticated
  using (
    ((select auth.uid()) = user_id and private.is_approved())
    or private.is_admin()
  );

drop policy if exists prancheta_slots_owner_all on public.prancheta_slots;
drop policy if exists prancheta_slots_owner_select on public.prancheta_slots;
drop policy if exists prancheta_slots_owner_insert on public.prancheta_slots;
drop policy if exists prancheta_slots_owner_update on public.prancheta_slots;
drop policy if exists prancheta_slots_owner_delete on public.prancheta_slots;

create policy prancheta_slots_owner_select on public.prancheta_slots
  for select to authenticated
  using (
    private.is_admin()
    or exists (
      select 1 from public.prancheta_tatica pt
      where pt.id = prancheta_slots.prancheta_id
        and pt.user_id = (select auth.uid())
        and private.is_approved()
    )
  );
create policy prancheta_slots_owner_insert on public.prancheta_slots
  for insert to authenticated
  with check (
    private.is_admin()
    or (
      exists (
        select 1 from public.prancheta_tatica pt
        where pt.id = prancheta_slots.prancheta_id
          and pt.user_id = (select auth.uid())
          and private.is_approved()
      )
      and exists (
        select 1 from public.favoritos f
        where f.user_id = (select auth.uid())
          and f.bid_atleta = prancheta_slots.bid_atleta
      )
    )
  );
create policy prancheta_slots_owner_update on public.prancheta_slots
  for update to authenticated
  using (
    private.is_admin()
    or exists (
      select 1 from public.prancheta_tatica pt
      where pt.id = prancheta_slots.prancheta_id
        and pt.user_id = (select auth.uid())
        and private.is_approved()
    )
  )
  with check (
    private.is_admin()
    or (
      exists (
        select 1 from public.prancheta_tatica pt
        where pt.id = prancheta_slots.prancheta_id
          and pt.user_id = (select auth.uid())
          and private.is_approved()
      )
      and exists (
        select 1 from public.favoritos f
        where f.user_id = (select auth.uid())
          and f.bid_atleta = prancheta_slots.bid_atleta
      )
    )
  );
create policy prancheta_slots_owner_delete on public.prancheta_slots
  for delete to authenticated
  using (
    private.is_admin()
    or exists (
      select 1 from public.prancheta_tatica pt
      where pt.id = prancheta_slots.prancheta_id
        and pt.user_id = (select auth.uid())
        and private.is_approved()
    )
  );

-- ---------------------------------------------------------------------------
-- Atomic RPCs. SECURITY INVOKER keeps RLS active.
-- ---------------------------------------------------------------------------
create or replace function public.cleanup_slots_before_favorite_delete()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  delete from public.prancheta_slots ps
  using public.prancheta_tatica pt
  where ps.prancheta_id = pt.id
    and pt.user_id = old.user_id
    and ps.bid_atleta = old.bid_atleta;
  return old;
end;
$$;

revoke all on function public.cleanup_slots_before_favorite_delete() from public, anon, authenticated;
drop trigger if exists trg_favorito_cleanup_slots on public.favoritos;
create trigger trg_favorito_cleanup_slots
  before delete on public.favoritos
  for each row execute function public.cleanup_slots_before_favorite_delete();

drop function if exists public.replace_prancheta_slots(uuid, jsonb);

create or replace function public.replace_prancheta_slots(
  p_board_id uuid,
  p_formation text,
  p_slots jsonb
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_count integer;
begin
  if v_user_id is null or not private.is_approved() then
    raise exception 'approved authentication required';
  end if;

  if not exists (
    select 1 from public.prancheta_tatica
    where id = p_board_id and user_id = v_user_id
  ) then
    raise exception 'tactical board not found';
  end if;

  if p_formation not in ('4-3-3', '4-4-2', '3-5-2', '4-2-3-1') then
    raise exception 'unsupported formation';
  end if;

  if p_slots is null or jsonb_typeof(p_slots) <> 'array' then
    raise exception 'slots must be a JSON array';
  end if;

  v_count := jsonb_array_length(p_slots);
  if v_count > 11 then
    raise exception 'a tactical board supports at most 11 starters';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_slots)
      as x(bid_atleta bigint, position_code text, slot_order smallint)
    where x.bid_atleta is null
      or x.position_code not in ('GK','CB','LB','RB','DM','CM','AM','LW','RW','ST')
      or x.slot_order not between 0 and 10
  ) then
    raise exception 'invalid tactical-board slot';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_slots)
      as x(bid_atleta bigint, position_code text, slot_order smallint)
    where x.position_code <> case p_formation
      when '4-3-3' then (array['GK','RB','CB','CB','LB','DM','CM','CM','RW','ST','LW'])[x.slot_order + 1]
      when '4-4-2' then (array['GK','RB','CB','CB','LB','RW','CM','CM','LW','ST','ST'])[x.slot_order + 1]
      when '3-5-2' then (array['GK','CB','CB','CB','RW','DM','CM','AM','LW','ST','ST'])[x.slot_order + 1]
      when '4-2-3-1' then (array['GK','RB','CB','CB','LB','DM','DM','RW','AM','LW','ST'])[x.slot_order + 1]
    end
  ) then
    raise exception 'slot position does not match formation';
  end if;

  if (
    select count(distinct x.bid_atleta)
    from jsonb_to_recordset(p_slots)
      as x(bid_atleta bigint, position_code text, slot_order smallint)
  ) <> v_count then
    raise exception 'an athlete cannot occupy multiple slots';
  end if;

  if (
    select count(distinct x.slot_order)
    from jsonb_to_recordset(p_slots)
      as x(bid_atleta bigint, position_code text, slot_order smallint)
  ) <> v_count then
    raise exception 'slot_order must be unique';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_slots)
      as x(bid_atleta bigint, position_code text, slot_order smallint)
    where not exists (
      select 1 from public.favoritos f
      where f.user_id = v_user_id and f.bid_atleta = x.bid_atleta
    )
  ) then
    raise exception 'only favorited athletes may be selected';
  end if;

  delete from public.prancheta_slots where prancheta_id = p_board_id;

  update public.prancheta_tatica
  set formation = p_formation, lineup_initialized = true
  where id = p_board_id and user_id = v_user_id;

  insert into public.prancheta_slots (
    prancheta_id, bid_atleta, slot_type, position_code, slot_order
  )
  select p_board_id, x.bid_atleta, 'starter', x.position_code, x.slot_order
  from jsonb_to_recordset(p_slots)
    as x(bid_atleta bigint, position_code text, slot_order smallint);
end;
$$;

revoke all on function public.replace_prancheta_slots(uuid, text, jsonb) from public, anon;
grant execute on function public.replace_prancheta_slots(uuid, text, jsonb) to authenticated, service_role;

create or replace function public.remove_favorite_and_slot(p_bid bigint)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null or not private.is_approved() then
    raise exception 'approved authentication required';
  end if;

  delete from public.prancheta_slots ps
  using public.prancheta_tatica pt
  where ps.prancheta_id = pt.id
    and pt.user_id = v_user_id
    and ps.bid_atleta = p_bid;

  delete from public.favoritos
  where user_id = v_user_id and bid_atleta = p_bid;
end;
$$;

revoke all on function public.remove_favorite_and_slot(bigint) from public, anon;
grant execute on function public.remove_favorite_and_slot(bigint) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Bootstrap identities. Scraper later updates athletes by BID and links clubs
-- to official source keys without touching user-owned data.
-- ---------------------------------------------------------------------------
with seed_clubes (name, state, federacao, webp_crest_url, source_key) as (
  values
    ('Flamengo', 'RJ', 'FERJ', '/crests/flamengo.webp', 'seed:flamengo'),
    ('Palmeiras', 'SP', 'FPF', '/crests/palmeiras.webp', 'seed:palmeiras'),
    ('Vasco da Gama', 'RJ', 'FERJ', '/crests/vasco.webp', 'seed:vasco'),
    ('Fluminense', 'RJ', 'FERJ', '/crests/fluminense.webp', 'seed:fluminense'),
    ('Santos', 'SP', 'FPF', '/crests/santos.webp', 'seed:santos')
)
insert into public.clubes (name, state, federacao, webp_crest_url, source_key)
select s.name, s.state, s.federacao, s.webp_crest_url, s.source_key
from seed_clubes s
where not exists (
  select 1 from public.clubes c
  where lower(trim(c.name)) = lower(trim(s.name))
    and c.state is not distinct from s.state
    and c.federacao is not distinct from s.federacao
)
on conflict (source_key) where source_key is not null do nothing;

with seed_atletas (
  bid, fifa_id, name, apelido, birth_date, nacionalidade, tem_passaporte,
  passaporte, main_position, posicao_secundaria, dominant_foot, height_cm,
  weight_kg, inicio_carreira, contract_end_date, club_source_key,
  current_category, experiencia_internacional, jogos_suspenso, youtube_video_url
 ) as (
 values
  (2210045, null, 'Lucas Pereira', null, '2006-03-14', 'Brasileiro', false, null, 'GK', null, 'right', 190, 82, null, '2028-06-30', 'seed:flamengo', 'SUB-20', false, 0, 'https://youtu.be/fb-lucas-pereira'),
  (2210101, null, 'Rafael Lima', null, '2006-07-22', 'Brasileiro', false, null, 'RB', null, 'right', 178, 71, null, '2026-12-15', 'seed:flamengo', 'SUB-20', false, 0, null),
  (2209888, 'FIFA-BR-209888', 'João Vitor', 'JV', '2006-01-09', 'Brasileiro / Italiano', true, 'Italiano', 'CB', 'DM', 'right', 187, 79, 2018, '2028-12-31', 'seed:palmeiras', 'SUB-20', true, 0, 'https://youtu.be/fb-joao-vitor'),
  (2210223, null, 'Pedro Henrique', null, '2006-05-30', 'Brasileiro', false, null, 'CB', null, 'left', 185, 77, null, '2027-11-30', 'seed:santos', 'SUB-20', false, 0, null),
  (2210330, null, 'Gabriel Souza', null, '2006-09-11', 'Brasileiro', false, null, 'LB', null, 'left', 176, 70, null, '2027-07-31', 'seed:vasco', 'SUB-20', false, 0, 'https://youtu.be/fb-gabriel-souza'),
  (2210440, null, 'Matheus Alves', null, '2006-02-18', 'Brasileiro', false, null, 'DM', null, 'right', 181, 74, null, '2028-06-30', 'seed:flamengo', 'SUB-20', false, 0, null),
  (2210551, null, 'Bruno Costa', null, '2006-11-04', 'Brasileiro', false, null, 'CM', null, 'right', 179, 72, null, '2027-12-31', 'seed:fluminense', 'SUB-20', false, 0, null),
  (2210662, 'FIFA-BR-210662', 'Enzo Ribeiro', 'Enzinho', '2007-04-25', 'Brasileiro / Português', true, 'Português', 'CM', 'AM', 'both', 177, 70, 2020, '2027-02-01', 'seed:palmeiras', 'SUB-17', true, 0, 'https://youtu.be/fb-enzo-ribeiro'),
  (2210884, null, 'Wesley Andrade', null, '2006-08-19', 'Brasileiro', false, null, 'LW', null, 'right', 174, 68, null, '2028-01-31', 'seed:flamengo', 'SUB-20', false, 0, 'https://youtu.be/fb-wesley-andrade'),
  (2210995, null, 'Vinícius Rocha', 'Vini', '2006-06-02', 'Brasileiro', false, null, 'ST', 'LW', 'right', 183, 76, 2018, '2027-01-20', 'seed:santos', 'SUB-20', false, 0, 'https://youtu.be/fb-vinicius-rocha'),
  (2211006, 'FIFA-BR-211006', 'Yuri Mendes', 'Yuri', '2006-10-27', 'Brasileiro / Espanhol', true, 'Espanhol', 'RW', 'LW', 'left', 175, 69, 2017, '2028-06-30', 'seed:vasco', 'SUB-20', true, 0, 'https://youtu.be/fb-yuri-mendes'),
  (2311502, null, 'Miguel Santos', null, '2009-02-08', 'Brasileiro', false, null, 'GK', null, 'right', 186, 74, null, '2029-06-30', 'seed:palmeiras', 'SUB-17', false, 0, null),
  (2311773, null, 'Kaique Moraes', null, '2009-05-16', 'Brasileiro', false, null, 'AM', null, 'left', 172, 65, null, '2027-06-30', 'seed:flamengo', 'SUB-17', false, 0, 'https://youtu.be/fb-kaique-moraes'),
  (2211117, null, 'Felipe Nunes', null, '2006-12-01', 'Brasileiro', false, null, 'ST', null, 'right', 182, 78, null, null, 'seed:fluminense', 'SUB-20', false, 0, null),
  (2311228, null, 'Danilo Cardoso', null, '2009-08-23', 'Brasileiro', false, null, 'CM', null, 'right', 176, 67, null, '2028-06-30', 'seed:palmeiras', 'SUB-17', false, 0, null),
  (2211440, null, 'Thiago Melo', 'Thiaguinho', '2006-04-12', 'Brasileiro', false, null, 'CB', null, 'right', 188, 80, 2017, '2026-06-30', 'seed:vasco', 'SUB-20', false, 2, null),
  (2412339, null, 'Igor Barbosa', null, '2011-03-05', 'Brasileiro', false, null, 'LW', null, 'right', 168, 58, null, '2029-12-31', 'seed:santos', 'SUB-15', false, 0, 'https://youtu.be/fb-igor-barbosa'),
  (2513551, null, 'Arthur Gomes', null, '2013-07-18', 'Brasileiro', false, null, 'ST', null, 'right', 158, 48, null, '2030-06-30', 'seed:flamengo', 'SUB-13', false, 0, null),
  (2614662, null, 'Bernardo Dias', null, '2015-05-09', 'Brasileiro', false, null, 'CM', null, 'left', 145, 39, null, null, 'seed:palmeiras', 'SUB-11', false, 0, null)
)
insert into public.atletas (
  bid, fifa_id, name, apelido, birth_date, nacionalidade, tem_passaporte,
  passaporte, main_position, posicao_secundaria, dominant_foot, height_cm,
  weight_kg, inicio_carreira, contract_end_date, current_club_id,
  current_category, experiencia_internacional, jogos_suspenso, youtube_video_url
)
select
  s.bid, s.fifa_id, s.name, s.apelido, s.birth_date::date, s.nacionalidade,
  s.tem_passaporte, s.passaporte, s.main_position, s.posicao_secundaria,
  s.dominant_foot, s.height_cm, s.weight_kg, s.inicio_carreira,
  s.contract_end_date::date, c.id, s.current_category,
  s.experiencia_internacional, s.jogos_suspenso, s.youtube_video_url
from seed_atletas s
join public.clubes c on c.source_key = s.club_source_key
on conflict (bid) do nothing;

commit;
