-- FOOTBASE Session 55 — precompute athlete stats on `atletas` instead of a live
-- per-row LATERAL aggregate in `view_atleta_resumo`.
--
-- Confirmed live: with the real authenticated session (RLS evaluating
-- `is_approved()` for real, not bypassed by service_role), each dashboard query
-- against `view_atleta_resumo` filtered/sorted by a stat (total_goals,
-- last_match_date, ...) took ~3.3s alone — Postgres can't push the WHERE/ORDER
-- BY down through the LATERAL join, so it must evaluate the per-athlete
-- aggregate for EVERY athlete before filtering. The dashboard fires 5 of these
-- in parallel, so wall time hit ~8.4s — right at the Postgres statement_timeout
-- edge, causing intermittent `57014` errors. Session 52's RLS-wrap fix resolved
-- this same symptom once already, but was only validated at the row count of
-- that session; `atuacoes_sumula` has since roughly doubled (FGF+FMF go-live,
-- ~16k -> ~32k rows), pushing the per-row cost back over the edge.
--
-- Fix: materialize the aggregate as real columns on `atletas`, kept fresh
-- incrementally by the ingestion pipeline (`recompute_atleta_stats`, called
-- once per affected athlete right after `ingestMatch` upserts appearances —
-- see lib/services/scraper/ingest.ts) instead of recomputed on every read.
-- `view_atleta_resumo` now just selects these columns directly + a cheap
-- `clubes` join — no LATERAL, no per-row aggregate at read time.

alter table atletas
  add column if not exists total_matches integer not null default 0,
  add column if not exists total_minutes integer not null default 0,
  add column if not exists total_goals integer not null default 0,
  add column if not exists total_assists integer not null default 0,
  add column if not exists total_yellow_cards integer not null default 0,
  add column if not exists total_red_cards integer not null default 0,
  add column if not exists total_clean_sheets integer not null default 0,
  add column if not exists times_played_above_category integer not null default 0,
  add column if not exists last_match_date date;

create index if not exists idx_atletas_total_goals on atletas (total_goals);
create index if not exists idx_atletas_last_match_date on atletas (last_match_date);

-- Recomputes one athlete's stat columns from the ground truth in
-- atuacoes_sumula/partidas_sumula. Idempotent — safe to call any number of
-- times for the same bid (e.g. on a reprocessed/corrected match).
create or replace function recompute_atleta_stats(p_bid bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update atletas a set
    total_matches = coalesce(stats.total_matches, 0),
    total_minutes = coalesce(stats.total_minutes, 0),
    total_goals = coalesce(stats.total_goals, 0),
    total_assists = coalesce(stats.total_assists, 0),
    total_yellow_cards = coalesce(stats.total_yellow_cards, 0),
    total_red_cards = coalesce(stats.total_red_cards, 0),
    total_clean_sheets = coalesce(stats.total_clean_sheets, 0),
    times_played_above_category = coalesce(stats.times_played_above_category, 0),
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
      max(p.match_date) as last_match_date
    from atuacoes_sumula s
    join partidas_sumula p on p.id = s.partida_id
    where s.bid_atleta = p_bid
  ) stats
  where a.bid = p_bid;
end;
$$;

-- One-time backfill for every athlete that already has appearances. Runs
-- through a raw migration connection (no PostgREST/JWT context), so
-- `guard_atleta_update()`'s `auth.role() = 'service_role'` check never
-- matches here — disable the trigger only for this backfill, same
-- transaction, re-enabled immediately after. The live ingestion path
-- (lib/services/scraper/ingest.ts, via the service_role API key) is
-- unaffected — auth.role() resolves correctly there.
alter table atletas disable trigger trg_guard_atleta_update;
do $$
declare r record;
begin
  for r in select distinct bid_atleta from atuacoes_sumula loop
    perform recompute_atleta_stats(r.bid_atleta);
  end loop;
end $$;
alter table atletas enable trigger trg_guard_atleta_update;

-- `view_atleta_resumo` now reads precomputed columns — no LATERAL, no
-- per-row aggregate at read time. Same output shape as before, so no
-- consumer (dashboard, search, comparison, dossiê) needs to change.
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
  (a.last_match_date is null or a.last_match_date < current_date - interval '30 days') as is_inactive_30d
from atletas a
left join clubes c on c.id = a.current_club_id;
