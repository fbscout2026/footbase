-- FOOTBASE Session 55 — "Gemas: categoria acima" dashboard widget.
--
-- `atletas.times_played_above_category` (added in the previous precompute
-- migration) compares each appearance's `player_category` against that
-- SAME match's `match_category` — confirmed live, this is always 0 today
-- across all ~41k real appearances (every source's parsers always record
-- the player as playing in whatever category the match itself is, never a
-- divergent value). That is NOT the "played above category" signal the
-- user actually wants for this widget.
--
-- The real signal, confirmed live to find 351 genuine cases across 147
-- athletes: compare each athlete's CURRENT category (`atletas.
-- current_category`, which advances as they age up divisions) against the
-- categories of matches they have ALREADY played — a match played above
-- their current category proves they already competed successfully above
-- where they're registered now. This is a different, additive column.

alter table atletas
  add column if not exists games_above_current_category integer not null default 0;

create index if not exists idx_atletas_games_above_current_category on atletas (games_above_current_category);

create or replace function recompute_atleta_stats(p_bid bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_category text;
begin
  select current_category into v_current_category from atletas where bid = p_bid;

  update atletas a set
    total_matches = coalesce(stats.total_matches, 0),
    total_minutes = coalesce(stats.total_minutes, 0),
    total_goals = coalesce(stats.total_goals, 0),
    total_assists = coalesce(stats.total_assists, 0),
    total_yellow_cards = coalesce(stats.total_yellow_cards, 0),
    total_red_cards = coalesce(stats.total_red_cards, 0),
    total_clean_sheets = coalesce(stats.total_clean_sheets, 0),
    times_played_above_category = coalesce(stats.times_played_above_category, 0),
    games_above_current_category = coalesce(stats.games_above_current_category, 0),
    last_match_date = stats.last_match_date
  from (
    select
      count(*)::int as total_matches,
      coalesce(sum(s.minutes_played), 0)::int as total_minutes,
      coalesce(sum(s.goals), 0)::int as total_goals,
      coalesce(sum(s.assists), 0)::int as total_assists,
      coalesce(sum(s.yellow_cards), 0)::int as total_yellow_cards,
      coalesce(sum(s.red_cards), 0)::int as total_red_cards,
      coalesce(sum(s.clean_sheet::int), 0)::int as total_clean_sheets,
      coalesce(sum((categoria_rank(p.match_category) > categoria_rank(s.player_category))::int), 0)::int as times_played_above_category,
      coalesce(sum((v_current_category is not null and categoria_rank(p.match_category) > categoria_rank(v_current_category))::int), 0)::int as games_above_current_category,
      max(p.match_date) as last_match_date
    from atuacoes_sumula s
    join partidas_sumula p on p.id = s.partida_id
    where s.bid_atleta = p_bid
  ) stats
  where a.bid = p_bid;
end;
$$;

-- One-time backfill for every athlete that already has appearances — same
-- trigger-disable dance as the original precompute migration (a raw
-- migration connection carries no PostgREST/JWT context, so
-- `guard_atleta_update()`'s `auth.role() = 'service_role'` check never
-- matches here).
alter table atletas disable trigger trg_guard_atleta_update;
do $$
declare r record;
begin
  for r in select distinct bid_atleta from atuacoes_sumula loop
    perform recompute_atleta_stats(r.bid_atleta);
  end loop;
end $$;
alter table atletas enable trigger trg_guard_atleta_update;

-- `view_atleta_resumo` exposes the new column directly (no LATERAL, same
-- pattern as every other precomputed stat).
create or replace view view_atleta_resumo
with (security_invoker = true) as
select
  a.bid,
  a.fifa_id,
  a.name,
  a.apelido,
  a.birth_date,
  date_part('year', a.birth_date)::smallint as ano_nascimento,
  date_part('year', age(a.birth_date))::smallint as age,
  a.nacionalidade,
  a.tem_passaporte,
  a.passaporte,
  a.main_position,
  a.posicao_secundaria,
  a.dominant_foot,
  a.height_cm,
  a.weight_kg,
  a.inicio_carreira,
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
  a.experiencia_internacional,
  a.jogos_suspenso,
  a.agent_id,
  a.claim_status,
  a.youtube_video_url,
  a.total_matches,
  a.total_minutes,
  a.total_goals,
  a.total_assists,
  (a.total_goals + a.total_assists) as participacoes_gol,
  a.total_yellow_cards,
  a.total_red_cards,
  a.total_clean_sheets,
  a.times_played_above_category,
  (a.times_played_above_category > 0) as ja_jogou_categoria_acima,
  a.last_match_date,
  (a.last_match_date is null or a.last_match_date < current_date - interval '30 days') as is_inactive_30d,
  a.games_above_current_category
from atletas a
left join clubes c on c.id = a.current_club_id;
