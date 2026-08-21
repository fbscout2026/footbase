-- FOOTBASE Session 55 — "Destaque da rodada" (dashboard hero card).
--
-- Was the ALL-TIME top scorer (unbounded `total_goals`), mislabeled as if it
-- were a weekly/round pick — no time window at all. Switches to goals over
-- each athlete's own last 5 matches, same "current form" window already
-- used for the tactical board's auto-lineup ranking (Session 55). Needs its
-- own precomputed column (not the client-side `loadRecentStatsByBids` used
-- for the prancheta's small favorited-athlete list) because finding the
-- single top scorer here means sorting across the WHOLE `atletas` table —
-- only cheap if the value is already a column, not a per-request scan.

alter table atletas
  add column if not exists goals_last5 integer not null default 0;

create index if not exists idx_atletas_goals_last5 on atletas (goals_last5);

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
    last_match_date = stats.last_match_date,
    goals_last5 = coalesce(recent.goals_last5, 0)
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
  ) stats,
  lateral (
    select coalesce(sum(recent5.goals), 0)::int as goals_last5
    from (
      select s.goals
      from atuacoes_sumula s
      join partidas_sumula p on p.id = s.partida_id
      where s.bid_atleta = p_bid
      order by p.match_date desc
      limit 5
    ) recent5
  ) recent
  where a.bid = p_bid;
end;
$$;

-- One-time backfill for every athlete that already has appearances (same
-- trigger-disable dance as the prior precompute migrations).
alter table atletas disable trigger trg_guard_atleta_update;
do $$
declare r record;
begin
  for r in select distinct bid_atleta from atuacoes_sumula loop
    perform recompute_atleta_stats(r.bid_atleta);
  end loop;
end $$;
alter table atletas enable trigger trg_guard_atleta_update;
