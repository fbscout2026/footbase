-- FOOTBASE — FB-ID for clubs (Session 57): a permanent internal identity for
-- clubs, mirroring the athlete `fb_id` architecture. `clubes.id` (uuid) stays the
-- actual FK target everywhere — zero existing foreign key changes type. `fb_id` is
-- an additional stable, human-friendly identity number for display, and
-- `clube_fontes` is a new multi-source crosswalk (mirrors `atleta_fontes`) that
-- `resolve-club-identity.ts` consults during ingestion so the same real club
-- appearing under a new federation/source resolves to the SAME club_id instead of
-- creating a duplicate row that needs a later manual `merge-clube.ts` pass.
--
-- Reserved range: fb_id >= 500000000 — never collides with a real 6-digit CBF
-- athlete bid, nor with the provisional-athlete range (>= 900000000). Purely
-- additive: `source_key`/the unique constraint on it are untouched, every existing
-- adapter keeps working unmodified (the crosswalk is wired into the single shared
-- `ingestMatch` core, not into each adapter).

create sequence if not exists clube_fb_id_seq start with 500000000;

alter table clubes add column if not exists fb_id bigint;

-- trg_guard_clube_operational_update (schema.sql) blocks a plain UPDATE on
-- clubes unless auth.role() = 'service_role' (or admin) — a migration run has no
-- JWT context, so impersonate service_role for this transaction, exactly like
-- supabase/tests/*.sql already does to exercise service_role-only paths.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- Backfill every existing club with a fresh fb_id before enforcing not-null/unique.
update clubes set fb_id = nextval('clube_fb_id_seq') where fb_id is null;

alter table clubes alter column fb_id set not null;
alter table clubes add constraint clubes_fb_id_key unique (fb_id);
alter table clubes add constraint clubes_fb_id_range check (fb_id >= 500000000);

create index if not exists idx_clubes_fb_id on clubes (fb_id);

-- ----------------------------------------------------------------------------
-- clube_fontes (multi-source identity map; mirrors atleta_fontes)
-- ----------------------------------------------------------------------------
create table if not exists clube_fontes (
  club_id uuid not null references clubes (id) on delete cascade,
  fonte text not null,                           -- 'cbf', 'fes', 'fgf', ...
  id_externo text not null,                      -- club id/slug within that source
  confidence text not null default 'exact' check (confidence in ('exact', 'matched', 'manual')),
  resolved_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (fonte, id_externo)
);

create index if not exists idx_clube_fontes_club_id on clube_fontes (club_id);

-- Backfill: every club that already has a source_key of the form "fonte:id_externo"
-- gets a matching clube_fontes row up front, so the resolver's tier-1 mapping
-- lookup already covers every club ingested before this migration. A club with a
-- null source_key (legacy seed data, never scraped) simply gets no crosswalk row —
-- it will resolve via crest/name on the next time a source touches it, same as any
-- other pre-existing club would.
insert into clube_fontes (club_id, fonte, id_externo, confidence)
select id, split_part(source_key, ':', 1), substring(source_key from position(':' in source_key) + 1), 'exact'
from clubes
where source_key is not null and position(':' in source_key) > 0
on conflict (fonte, id_externo) do nothing;

alter table clube_fontes enable row level security;

-- Same visibility pattern as atleta_fontes: admin-only via the client API;
-- ingestion writes through service_role, which bypasses RLS entirely.
create policy clube_fontes_select_admin on clube_fontes
  for select using (private.is_admin());
create policy clube_fontes_write_admin on clube_fontes
  for all using (private.is_admin()) with check (private.is_admin());

-- Expose fb_id through the club summary view (CREATE OR REPLACE VIEW can append a
-- new output column safely — only RENAMING an existing one requires drop+recreate,
-- lesson from Session 56 — so this is safe as a plain replace).
create or replace view view_clube_resumo
with (security_invoker = true) as
select
  c.id,
  c.name,
  c.state,
  c.federacao,
  c.webp_crest_url,
  c.reivindicado_por,
  c.claim_status,
  coalesce(sq.total_atletas, 0) as total_atletas,
  coalesce(mp.categorias_ativas, '{}'::text[]) as categorias_ativas,
  coalesce(mp.torneios_em_disputa, '{}'::text[]) as torneios_em_disputa,
  c.fb_id
from clubes c
left join lateral (
  select count(*)::int as total_atletas
  from atletas a where a.current_club_id = c.id
) sq on true
left join lateral (
  select
    array_agg(distinct p.match_category order by p.match_category) as categorias_ativas,
    array_agg(distinct t.name) as torneios_em_disputa
  from partidas_sumula p
  join torneios t on t.id = p.torneio_id
  where p.home_club_id = c.id or p.away_club_id = c.id
) mp on true;
