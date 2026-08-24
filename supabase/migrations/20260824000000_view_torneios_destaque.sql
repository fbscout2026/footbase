-- FOOTBASE Session 57 — real "featured tournaments" signal for the dashboard.
-- `loadTorneiosDestaque` used to just list tournaments alphabetically (first 8, no
-- real "destaque" meaning). This view ranks by recent ingestion activity instead —
-- `partidas_sumula.created_at` is the scraper's own write timestamp on every súmula
-- it ingests, so "how many súmulas landed for this tournament in the last 30 days"
-- is a real, already-available signal, no new column on any existing table needed.
-- Purely additive (a new view over existing tables) — zero scraper impact, the
-- scraper never reads or writes this view.

create or replace view view_torneios_destaque
with (security_invoker = true) as
select
  t.id,
  t.name,
  t.federation,
  t.category,
  t.year,
  count(ps.id) filter (where ps.created_at >= now() - interval '30 days') as recent_activity
from torneios t
left join partidas_sumula ps on ps.torneio_id = t.id
group by t.id, t.name, t.federation, t.category, t.year;

-- end of migration
