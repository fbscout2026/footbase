-- FOOTBASE Session 55 — persists athlete duplicate candidates (previously only
-- printed by scan-athlete-duplicates.ts to a terminal, never visible to anyone but
-- whoever happened to run the script). Curated by an admin at /admin, same
-- decision (merge/dismiss) `merge-atleta.ts` already makes from the CLI — this is
-- purely making that same decision visible and actionable without a terminal.
--
-- Never club/agent-visible: identity reconciliation is admin curation, same tier as
-- club claim approval and correction requests, not something clubs/agents act on.

create table if not exists atleta_duplicate_candidates (
  id uuid primary key default gen_random_uuid(),
  bid_a bigint not null references atletas (bid) on delete cascade,
  bid_b bigint not null references atletas (bid) on delete cascade,
  -- 'forte' = same normalized name + same known birth_date. 'clube+nome' = same
  -- normalized name + same current club. Mirrors scan-athlete-duplicates.ts's tiers
  -- exactly — never store a tolerant/fuzzy match here, only what that script itself
  -- treats as a real candidate (see its module doc, Session 55, for why looser
  -- matching was tried twice and rejected both times).
  tier text not null check (tier in ('forte', 'clube+nome')),
  status text not null default 'pending' check (status in ('pending', 'merged', 'dismissed')),
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references profiles (id) on delete set null,
  constraint atleta_duplicate_candidates_distinct check (bid_a <> bid_b),
  unique (bid_a, bid_b)
);

create index if not exists idx_atleta_dup_candidates_status on atleta_duplicate_candidates (status);

alter table atleta_duplicate_candidates enable row level security;

-- Admin-only, both read and write — same shape as every other curation queue
-- (club_correction_requests, solicitacoes_correcao). The scan writer uses
-- service_role (bypasses RLS); this policy only ever gates a real authenticated
-- admin session reading/resolving candidates in the UI.
create policy atleta_duplicate_candidates_admin on atleta_duplicate_candidates
  for all using (private.is_admin()) with check (private.is_admin());
