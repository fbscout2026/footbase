-- FOOTBASE Session 55 — card reasons + which club each appearance was for.
--
-- Both are already visible in the parsed data at ingestion time (the súmula's
-- own "Motivo:" line for cards; `ParsedAppearance.side` for which club) but
-- were being discarded before ever reaching the database. Additive only —
-- nothing existing changes shape.
--
-- `club_id` lets the dossiê show which OPPONENT an athlete faced in a given
-- match (the other club on that same `partidas_sumula` row) — not derivable
-- after the fact from what's already stored, since no per-appearance club
-- link existed before this column.
--
-- Card reasons need their own child table, not a single text column, because
-- one appearance can carry up to 2 yellow-card events (each with its own
-- reason) plus a red card — a real per-event history, not an aggregate.

alter table atuacoes_sumula
  add column if not exists club_id uuid references clubes (id) on delete set null;

create index if not exists idx_atuacoes_club on atuacoes_sumula (club_id);

create table if not exists atuacao_cartoes (
  id uuid primary key default gen_random_uuid(),
  atuacao_id uuid not null references atuacoes_sumula (id) on delete cascade,
  card_type text not null check (card_type in ('yellow', 'red')),
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_atuacao_cartoes_atuacao on atuacao_cartoes (atuacao_id);

alter table atuacao_cartoes enable row level security;

-- Same shape as every other súmula-derived table: readable by approved
-- accounts, written only by admin/service_role (the ingestion pipeline uses
-- the service_role key, which bypasses RLS entirely — this policy only ever
-- gates a regular authenticated session).
create policy atuacao_cartoes_select_approved on atuacao_cartoes
  for select using ((select private.is_approved()) or (select private.is_admin()));
create policy atuacao_cartoes_write_admin on atuacao_cartoes
  for all using (private.is_admin()) with check (private.is_admin());
