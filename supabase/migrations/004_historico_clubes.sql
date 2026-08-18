-- ============================================================================
-- FOOTBASE — Migration 004: historico_clubes (career club history)
-- ============================================================================
-- Run once in the Supabase SQL editor. Adds the club-history table required by
-- the athlete dossier's "Histórico de clubes" section. The schema previously
-- only stored the CURRENT club (atletas.current_club_id); this stores previous
-- clubs with periods (Transfermarkt-style career). Idempotent.
-- ============================================================================

begin;

create table if not exists historico_clubes (
  id uuid primary key default gen_random_uuid(),
  bid_atleta bigint not null references atletas (bid) on delete cascade,
  clube_id uuid references clubes (id) on delete set null,
  clube_nome text not null,
  ano_inicio smallint,
  ano_fim smallint,                 -- null = current club
  created_at timestamptz not null default now()
);

create index if not exists idx_historico_bid on historico_clubes (bid_atleta);

alter table historico_clubes enable row level security;

drop policy if exists historico_select_approved on historico_clubes;
drop policy if exists historico_write_admin on historico_clubes;
create policy historico_select_approved on historico_clubes
  for select using (private.is_approved() or private.is_admin());
create policy historico_write_admin on historico_clubes
  for all using (private.is_admin()) with check (private.is_admin());

commit;
