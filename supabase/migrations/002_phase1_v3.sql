-- ============================================================================
-- FOOTBASE — Migration 002: Phase 1 (v3.0 Enterprise)
-- ============================================================================
-- ⚠️ SUPERSEDED BY 003_v3_caso_uso.sql — do NOT run this if you have not yet.
-- 003 is self-contained and includes everything here plus the v3.0 Use-Case
-- additions. Kept only as a historical record.
-- ============================================================================
-- Run this ONCE in the Supabase SQL editor. It upgrades the live project from
-- the Session-1/4 schema to the v3.0 schema:
--   * atletas: + passaporte, rename youtube_highlights_url -> youtube_video_url
--   * new: scraping_logs, partidas_sumula, prancheta_tatica, prancheta_slots,
--          solicitacoes_correcao
--   * atuacoes_sumula: refactored to reference partidas_sumula (+ assists,
--          clean_sheet); the old table is dropped and recreated (it is empty).
--   * view_atleta_resumo: rebuilt over the new match model.
-- Safe to run on a database whose match tables are empty. If atuacoes_sumula
-- already holds data, back it up first — step 5 drops it.
-- ============================================================================

begin;

-- 1. Drop the view first (it depends on atuacoes_sumula and youtube_highlights_url).
drop view if exists view_atleta_resumo;

-- 2. atletas column changes.
alter table atletas add column if not exists passaporte text;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'atletas'
      and column_name = 'youtube_highlights_url'
  ) then
    alter table atletas rename column youtube_highlights_url to youtube_video_url;
  end if;
end $$;

alter table atletas add column if not exists youtube_video_url text;

-- 3. Rebuild the athlete update guard so agents also cannot edit passaporte.
create or replace function guard_atleta_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if private.is_admin() then
    return new;
  end if;

  if exists (
    select 1 from agentes a
    where a.id = old.agent_id
      and a.user_id = auth.uid()
      and a.verified_status = 'verified'
      and old.claim_status = 'claimed'
  ) then
    if new.bid is distinct from old.bid
      or new.fifa_id is distinct from old.fifa_id
      or new.passaporte is distinct from old.passaporte
      or new.name is distinct from old.name
      or new.birth_date is distinct from old.birth_date
      or new.main_position is distinct from old.main_position
      or new.contract_end_date is distinct from old.contract_end_date
      or new.current_club_id is distinct from old.current_club_id
      or new.current_category is distinct from old.current_category
      or new.agent_id is distinct from old.agent_id
      or new.claim_status is distinct from old.claim_status
    then
      raise exception 'agents may only edit dominant_foot, height_cm, weight_kg, youtube_video_url';
    end if;
    return new;
  end if;

  raise exception 'not authorized to update this athlete';
end;
$$;
revoke execute on function guard_atleta_update() from public, anon, authenticated;

-- 4. scraping_logs.
create table if not exists scraping_logs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  target_url text,
  torneio_id uuid references torneios (id) on delete set null,
  status text not null default 'running' check (status in ('running', 'success', 'partial', 'failed')),
  records_ingested integer not null default 0,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists idx_scraping_logs_status on scraping_logs (status);
create index if not exists idx_scraping_logs_started on scraping_logs (started_at desc);

-- 5. Refactor the match model. Old atuacoes_sumula referenced (torneio_id,
--    match_date) directly and had a generated played_above_category column;
--    drop it and rebuild over partidas_sumula.
drop table if exists atuacoes_sumula cascade;

create table if not exists partidas_sumula (
  id uuid primary key default gen_random_uuid(),
  torneio_id uuid not null references torneios (id) on delete cascade,
  match_date date not null,
  match_category text not null references categoria_ordem (categoria),
  rodada text,
  home_club_id uuid references clubes (id) on delete set null,
  away_club_id uuid references clubes (id) on delete set null,
  home_score smallint check (home_score >= 0),
  away_score smallint check (away_score >= 0),
  scraping_log_id uuid references scraping_logs (id) on delete set null,
  source_url text,
  created_at timestamptz not null default now(),
  unique (torneio_id, match_date, home_club_id, away_club_id)
);
create index if not exists idx_partidas_torneio on partidas_sumula (torneio_id);
create index if not exists idx_partidas_date on partidas_sumula (match_date desc);
create index if not exists idx_partidas_home on partidas_sumula (home_club_id);
create index if not exists idx_partidas_away on partidas_sumula (away_club_id);

create table if not exists atuacoes_sumula (
  id uuid primary key default gen_random_uuid(),
  partida_id uuid not null references partidas_sumula (id) on delete cascade,
  bid_atleta bigint not null references atletas (bid) on delete cascade,
  player_category text not null references categoria_ordem (categoria),
  minutes_played smallint not null default 0 check (minutes_played between 0 and 130),
  goals smallint not null default 0 check (goals >= 0),
  assists smallint not null default 0 check (assists >= 0),
  yellow_cards smallint not null default 0 check (yellow_cards in (0, 1, 2)),
  red_cards smallint not null default 0 check (red_cards in (0, 1)),
  clean_sheet boolean not null default false,
  created_at timestamptz not null default now(),
  unique (partida_id, bid_atleta)
);
create index if not exists idx_atuacoes_bid on atuacoes_sumula (bid_atleta);
create index if not exists idx_atuacoes_partida on atuacoes_sumula (partida_id);

-- 6. prancheta_tatica + slots, solicitacoes_correcao.
create table if not exists prancheta_tatica (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default 'Minha Prancheta',
  formation text not null default '4-3-3',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_prancheta_user on prancheta_tatica (user_id);

drop trigger if exists trg_prancheta_updated_at on prancheta_tatica;
create trigger trg_prancheta_updated_at
  before update on prancheta_tatica
  for each row execute function set_updated_at();

create table if not exists prancheta_slots (
  id uuid primary key default gen_random_uuid(),
  prancheta_id uuid not null references prancheta_tatica (id) on delete cascade,
  bid_atleta bigint not null references atletas (bid) on delete cascade,
  slot_type text not null check (slot_type in ('starter', 'bench')),
  position_code text,
  slot_order smallint not null default 0,
  created_at timestamptz not null default now(),
  unique (prancheta_id, bid_atleta),
  unique (prancheta_id, slot_type, slot_order)
);
create index if not exists idx_prancheta_slots_board on prancheta_slots (prancheta_id);

create table if not exists solicitacoes_correcao (
  id uuid primary key default gen_random_uuid(),
  bid_atleta bigint not null references atletas (bid) on delete cascade,
  requested_by uuid not null references auth.users (id) on delete cascade,
  field_name text not null,
  current_value text,
  suggested_value text not null,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_solicitacoes_bid on solicitacoes_correcao (bid_atleta);
create index if not exists idx_solicitacoes_requester on solicitacoes_correcao (requested_by);
create index if not exists idx_solicitacoes_status on solicitacoes_correcao (status);

-- 7. RLS for all new / recreated tables.
alter table scraping_logs enable row level security;
alter table partidas_sumula enable row level security;
alter table atuacoes_sumula enable row level security;
alter table prancheta_tatica enable row level security;
alter table prancheta_slots enable row level security;
alter table solicitacoes_correcao enable row level security;

drop policy if exists scraping_logs_select_admin on scraping_logs;
drop policy if exists scraping_logs_write_admin on scraping_logs;
create policy scraping_logs_select_admin on scraping_logs
  for select using (private.is_admin());
create policy scraping_logs_write_admin on scraping_logs
  for all using (private.is_admin()) with check (private.is_admin());

drop policy if exists partidas_select_approved on partidas_sumula;
drop policy if exists partidas_write_admin on partidas_sumula;
create policy partidas_select_approved on partidas_sumula
  for select using (private.is_approved() or private.is_admin());
create policy partidas_write_admin on partidas_sumula
  for all using (private.is_admin()) with check (private.is_admin());

drop policy if exists atuacoes_select_approved on atuacoes_sumula;
drop policy if exists atuacoes_write_admin on atuacoes_sumula;
create policy atuacoes_select_approved on atuacoes_sumula
  for select using (private.is_approved() or private.is_admin());
create policy atuacoes_write_admin on atuacoes_sumula
  for all using (private.is_admin()) with check (private.is_admin());

drop policy if exists prancheta_owner_all on prancheta_tatica;
create policy prancheta_owner_all on prancheta_tatica
  for all
  using (user_id = auth.uid() or private.is_admin())
  with check (user_id = auth.uid() or private.is_admin());

drop policy if exists prancheta_slots_owner_all on prancheta_slots;
create policy prancheta_slots_owner_all on prancheta_slots
  for all
  using (
    private.is_admin()
    or exists (
      select 1 from prancheta_tatica pt
      where pt.id = prancheta_slots.prancheta_id and pt.user_id = auth.uid()
    )
  )
  with check (
    private.is_admin()
    or exists (
      select 1 from prancheta_tatica pt
      where pt.id = prancheta_slots.prancheta_id and pt.user_id = auth.uid()
    )
  );

drop policy if exists solicitacoes_select_own_or_admin on solicitacoes_correcao;
drop policy if exists solicitacoes_insert_own on solicitacoes_correcao;
drop policy if exists solicitacoes_update_admin on solicitacoes_correcao;
drop policy if exists solicitacoes_delete_admin on solicitacoes_correcao;
create policy solicitacoes_select_own_or_admin on solicitacoes_correcao
  for select using (requested_by = auth.uid() or private.is_admin());
create policy solicitacoes_insert_own on solicitacoes_correcao
  for insert with check (
    requested_by = auth.uid() and (private.is_approved() or private.is_admin())
  );
create policy solicitacoes_update_admin on solicitacoes_correcao
  for update using (private.is_admin()) with check (private.is_admin());
create policy solicitacoes_delete_admin on solicitacoes_correcao
  for delete using (private.is_admin());

-- 8. Rebuild the athlete summary view over the new match model.
create or replace view view_atleta_resumo
with (security_invoker = true) as
select
  a.bid,
  a.fifa_id,
  a.passaporte,
  a.name,
  a.birth_date,
  date_part('year', age(a.birth_date))::smallint as age,
  a.main_position,
  a.dominant_foot,
  a.height_cm,
  a.weight_kg,
  a.contract_end_date,
  case
    when a.contract_end_date is null then 'free_agent'
    when a.contract_end_date < current_date then 'expired'
    when a.contract_end_date <= current_date + interval '180 days' then 'expiring_soon'
    else 'active'
  end as contract_status,
  a.current_club_id,
  c.name as current_club_name,
  c.webp_crest_url as current_club_crest_url,
  a.current_category,
  a.agent_id,
  a.claim_status,
  a.youtube_video_url,
  stats.total_matches,
  stats.total_minutes,
  stats.total_goals,
  stats.total_assists,
  stats.total_yellow_cards,
  stats.total_red_cards,
  stats.total_clean_sheets,
  stats.times_played_above_category,
  stats.last_match_date,
  (stats.last_match_date is null or stats.last_match_date < current_date - interval '30 days') as is_inactive_30d
from atletas a
left join clubes c on c.id = a.current_club_id
left join lateral (
  select
    count(*)::int as total_matches,
    coalesce(sum(s.minutes_played), 0)::int as total_minutes,
    coalesce(sum(s.goals), 0)::int as total_goals,
    coalesce(sum(s.assists), 0)::int as total_assists,
    coalesce(sum(s.yellow_cards), 0)::int as total_yellow_cards,
    coalesce(sum(s.red_cards), 0)::int as total_red_cards,
    coalesce(sum(s.clean_sheet::int), 0)::int as total_clean_sheets,
    coalesce(sum((categoria_rank(p.match_category) > categoria_rank(s.player_category))::int), 0)::int as times_played_above_category,
    max(p.match_date) as last_match_date
  from atuacoes_sumula s
  join partidas_sumula p on p.id = s.partida_id
  where s.bid_atleta = a.bid
) stats on true;

commit;
