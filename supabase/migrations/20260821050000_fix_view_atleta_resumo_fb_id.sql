-- FOOTBASE — fix-up for 20260821040000_rename_bid_to_fb_id.sql.
--
-- Found live, right after applying the previous migration: unlike RLS
-- policies/indexes/CHECK constraints (which Postgres tracks by attribute
-- number and updates automatically), a VIEW's OWN output column names are
-- fixed at CREATE VIEW time and do NOT follow an `ALTER TABLE ... RENAME
-- COLUMN` on the underlying table — the view keeps exposing the old name
-- forever until it's explicitly re-created. `view_atleta_resumo` kept
-- exposing `bid` (confirmed live: `select fb_id from view_atleta_resumo`
-- failed with 42703 "column view_atleta_resumo.fb_id does not exist —
-- perhaps you meant view_atleta_resumo.bid", even though the base
-- `atletas` table's column was already correctly renamed).
--
-- Confirmed live: `CREATE OR REPLACE VIEW` refuses even just renaming an
-- existing output column ("ERROR: cannot change name of view column "bid" to
-- "fb_id" (SQLSTATE 42P16)") — it only tolerates appending new trailing
-- columns. A real `DROP VIEW` + `CREATE VIEW` is required. `view_atleta_resumo`
-- carries no RLS of its own (`security_invoker = true` — it runs under the
-- caller's rights and defers entirely to the base `atletas`/`clubes` RLS), so
-- dropping and recreating it doesn't touch any policy. `view_clube_resumo`
-- never referenced bid/fb_id at all, so it's unaffected and not touched here.

begin;

drop view if exists view_atleta_resumo;

create view view_atleta_resumo
with (security_invoker = true) as
select
  a.fb_id,
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

commit;
