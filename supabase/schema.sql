-- ============================================================================
-- FOOTBASE — v3.0 Enterprise schema (Supabase / PostgreSQL)
-- Aligned with the official Use-Case & Functional Spec (v3.0).
-- ============================================================================
-- Architectural notes:
--  * `atletas.bid` (CBF registration number) is the PK — the real-world dedup
--    key across tournaments/federations, never a surrogate.
--  * Account gate lives on `profiles` (pending->approved); per-agent claim
--    authority lives on `agentes.verified_status`. Clubs are "seed profiles":
--    never created by users, only by scraping ingestion, and claimed via the
--    `solicitacoes_reivindicacao` audit trail (admin approves).
--  * Match ingestion is normalized: partidas_sumula (match) -> atuacoes_sumula
--    (per-player appearance).
--  * Column-level write protection: agents may only edit apelido, dominant_foot,
--    height_cm, weight_kg, posicao_secundaria and youtube_video_url. Every
--    official/biographic/institutional field is admin-only.
--  * Security hardening (Supabase Security Advisor clean): extensions in
--    `extensions`, RLS helpers in a non-exposed `private` schema, every
--    function pins search_path, trigger-only functions have EXECUTE revoked.
-- ============================================================================

create schema if not exists extensions;

create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "pg_trgm" with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- categoria_ordem (ordinal categories for "played above category" logic)
-- ----------------------------------------------------------------------------
create table if not exists categoria_ordem (
  categoria text primary key,
  rank smallint not null unique
);

-- Full youth range, ranked by age. CBF national tends to use the odd categories +
-- SUB-20; state federations (FPF, FERJ, …) also run the even ones + SUB-19. Every
-- category the ingestion can meet must exist here (FK target), else upserts break.
insert into categoria_ordem (categoria, rank) values
  ('SUB-11', 1), ('SUB-12', 2), ('SUB-13', 3), ('SUB-14', 4), ('SUB-15', 5),
  ('SUB-16', 6), ('SUB-17', 7), ('SUB-18', 8), ('SUB-19', 9), ('SUB-20', 10)
on conflict (categoria) do update set rank = excluded.rank;

create or replace function categoria_rank(cat text)
returns smallint
language sql
immutable
set search_path = public
as $$
  select rank from categoria_ordem where categoria = cat;
$$;

-- ----------------------------------------------------------------------------
-- profiles (account-level approval gate, 1:1 with auth.users)
-- ----------------------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'agent' check (role in ('agent', 'club', 'admin')),
  account_status text not null default 'pending' check (account_status in ('pending', 'approved', 'rejected')),
  full_name text,
  whatsapp text,
  organization text,                     -- Empresa / Agência / Clube informed at signup
  password_reset_used boolean not null default false, -- self-service reset: one lifetime use
  created_at timestamptz not null default now()
);

-- RLS helpers, isolated in `private` so they are unreachable via PostgREST RPC
-- but still callable from policies (schema-qualified) and by the roles that run
-- those policies.
create or replace function private.is_approved()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and account_status in ('approved')
  );
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$;

revoke execute on function private.is_admin() from public;
revoke execute on function private.is_approved() from public;
grant execute on function private.is_admin() to anon, authenticated, service_role;
grant execute on function private.is_approved() to anon, authenticated, service_role;

-- Self-service profile updates use an exact allowlist. Identity, role,
-- approval status and audit fields remain administrative even via direct API.
create or replace function guard_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if private.is_admin() or auth.role() = 'service_role' then
    return new;
  end if;

  if old.password_reset_used is distinct from new.password_reset_used then
    if old.password_reset_used = true or new.password_reset_used <> true then
      raise exception 'password_reset_used can only move from false to true';
    end if;
  end if;

  if (to_jsonb(new) - array['full_name', 'whatsapp', 'organization', 'password_reset_used']::text[])
    is distinct from
    (to_jsonb(old) - array['full_name', 'whatsapp', 'organization', 'password_reset_used']::text[])
  then
    raise exception 'users may only edit full_name, whatsapp and organization';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_profile_update on profiles;
create trigger trg_guard_profile_update
  before update on profiles
  for each row execute function guard_profile_update();

revoke execute on function guard_profile_update() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- clubes (seed profiles — born only via ingestion, claimed via requests)
-- ----------------------------------------------------------------------------
create table if not exists clubes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source_key text,                         -- '<source>:<external_id>' for scraper upserts
  state char(2),
  federacao text,                        -- e.g. 'CBF', 'FPF', 'FERJ'
  webp_crest_url text,
  reivindicado_por uuid references auth.users (id) on delete set null,
  claim_status text not null default 'unclaimed' check (claim_status in ('unclaimed', 'pending', 'claimed')),
  created_at timestamptz not null default now()
);

create index if not exists idx_clubes_state on clubes (state);
create index if not exists idx_clubes_claim on clubes (claim_status);
-- Plain UNIQUE constraint (not a partial index) — required for `ingest.ts`'s
-- `upsert(..., { onConflict: "source_key" })` to work at all: Postgres can't target a
-- PARTIAL unique index via a simple ON CONFLICT clause without repeating its WHERE
-- predicate, which PostgREST's upsert never does. NULL is safe here (multiple NULL
-- source_key rows never conflict, standard SQL behavior) — see migration
-- 20260816000000_fix_clubes_source_key_unique_constraint.sql for the live incident.
alter table clubes add constraint clubes_source_key_key unique (source_key);

-- ----------------------------------------------------------------------------
-- agentes
-- ----------------------------------------------------------------------------
create table if not exists agentes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete cascade,
  full_name text not null,
  agency_name text,
  verified_status text not null default 'pending' check (verified_status in ('pending', 'verified', 'rejected')),
  license_level text,                    -- 'FIFA', 'CBF Intermediário', ...
  markets text[] not null default '{}',  -- mercados de atuação: {Brasil, Europa, ...}
  instagram text,
  phone text,
  contact_email text,
  bio text check (bio is null or char_length(bio) <= 800),
  created_at timestamptz not null default now()
);

create index if not exists idx_agentes_user_id on agentes (user_id);

create or replace function guard_agente_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if private.is_admin() or auth.role() = 'service_role' then
    return new;
  end if;

  if (to_jsonb(new) - array[
      'full_name', 'agency_name', 'markets', 'instagram',
      'phone', 'contact_email', 'bio'
    ]::text[])
    is distinct from
    (to_jsonb(old) - array[
      'full_name', 'agency_name', 'markets', 'instagram',
      'phone', 'contact_email', 'bio'
    ]::text[])
  then
    raise exception 'agents may only edit their seven profile fields';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_agente_update on agentes;
create trigger trg_guard_agente_update
  before update on agentes
  for each row execute function guard_agente_update();

revoke execute on function guard_agente_update() from public, anon, authenticated;

-- Auto-provision profiles (+ agentes for agent signups) from signup metadata.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  signup_role text := case when meta->>'role' = 'club' then 'club' else 'agent' end;
begin
  insert into profiles (id, role, account_status, full_name, whatsapp, organization)
  values (
    new.id,
    signup_role,
    'pending',
    meta->>'full_name',
    meta->>'whatsapp',
    meta->>'organization'
  );

  if signup_role = 'agent' then
    insert into agentes (user_id, full_name, agency_name)
    values (
      new.id,
      coalesce(meta->>'full_name', ''),
      coalesce(meta->>'agency_name', meta->>'organization')
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_handle_new_user on auth.users;
create trigger trg_handle_new_user
  after insert on auth.users
  for each row execute function handle_new_user();

revoke execute on function handle_new_user() from public, anon, authenticated;

-- shared updated_at bumper
create or replace function set_updated_at()
returns trigger language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- atletas (unified athlete dossier)
-- ----------------------------------------------------------------------------
create table if not exists atletas (
  bid bigint primary key,
  fifa_id text unique,
  name text not null,
  apelido text,                          -- nome popular
  birth_date date,                       -- nullable: seeded from any source, backfilled when a source provides it
  nacionalidade text not null default 'Brasileiro',
  tem_passaporte boolean not null default false,
  passaporte text,                       -- optional detail (country/type)
  main_position text check (main_position in ('GK','CB','LB','RB','DM','CM','AM','LW','RW','ST')),
  posicao_secundaria text check (posicao_secundaria in ('GK','CB','LB','RB','DM','CM','AM','LW','RW','ST')),
  dominant_foot text check (dominant_foot in ('left', 'right', 'both')),
  height_cm smallint check (height_cm between 100 and 220),
  weight_kg smallint check (weight_kg between 30 and 150),
  inicio_carreira smallint,              -- year career started
  contract_end_date date,
  current_club_id uuid references clubes (id) on delete set null,
  current_category text references categoria_ordem (categoria),
  experiencia_internacional boolean not null default false,
  jogos_suspenso smallint not null default 0,
  agent_id uuid references agentes (id) on delete set null,
  claim_status text not null default 'unclaimed' check (claim_status in ('unclaimed', 'pending', 'claimed')),
  youtube_video_url text,                -- unlisted highlight video (agent-editable)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_atletas_club on atletas (current_club_id);
create index if not exists idx_atletas_category on atletas (current_category);
create index if not exists idx_atletas_contract_end on atletas (contract_end_date);
create index if not exists idx_atletas_agent on atletas (agent_id);
create index if not exists idx_atletas_claim_status on atletas (claim_status);
create index if not exists idx_atletas_birth_date on atletas (birth_date);
create index if not exists idx_atletas_nacionalidade on atletas (nacionalidade);
create index if not exists idx_atletas_position on atletas (main_position);
create index if not exists idx_atletas_name_trgm on atletas using gin (name gin_trgm_ops);

drop trigger if exists trg_atletas_updated_at on atletas;
create trigger trg_atletas_updated_at
  before update on atletas
  for each row execute function set_updated_at();

-- Column-level write guard. Agents (verified + claiming) may only touch
-- apelido, dominant_foot, height_cm, weight_kg, posicao_secundaria and
-- youtube_video_url. Everything else is
-- listed here and is admin-only.
create or replace function guard_atleta_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if private.is_admin() or auth.role() = 'service_role' then
    return new;
  end if;

  if exists (
    select 1 from agentes a
    where a.id = old.agent_id
      and a.user_id = auth.uid()
      and a.verified_status = 'verified'
      and old.claim_status = 'claimed'
  ) then
    if (to_jsonb(new) - array[
        'apelido', 'dominant_foot', 'height_cm', 'weight_kg',
        'posicao_secundaria', 'youtube_video_url', 'updated_at'
      ]::text[])
      is distinct from
      (to_jsonb(old) - array[
        'apelido', 'dominant_foot', 'height_cm', 'weight_kg',
        'posicao_secundaria', 'youtube_video_url', 'updated_at'
      ]::text[])
    then
      raise exception 'agents may only edit apelido, dominant_foot, height_cm, weight_kg, posicao_secundaria and youtube_video_url';
    end if;
    return new;
  end if;

  raise exception 'not authorized to update this athlete';
end;
$$;

drop trigger if exists trg_guard_atleta_update on atletas;
create trigger trg_guard_atleta_update
  before update on atletas
  for each row execute function guard_atleta_update();

revoke execute on function guard_atleta_update() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- confederacoes / paises / federacoes — navigation hierarchy for the Torneios
-- tab (Continente/Confederação → País → Federação nacional/estadual). Static
-- reference data, curated by admin; seeded on demand (product is Brazil-only
-- today) rather than inventing data for countries with no real content.
-- ----------------------------------------------------------------------------
create table if not exists confederacoes (
  id uuid primary key default gen_random_uuid(),
  continente text not null unique,
  codigo text not null unique,
  nome text not null
);

create table if not exists paises (
  id uuid primary key default gen_random_uuid(),
  confederacao_id uuid not null references confederacoes (id) on delete restrict,
  nome text not null,
  codigo text,
  unique (confederacao_id, nome)
);

create table if not exists federacoes (
  id uuid primary key default gen_random_uuid(),
  pais_id uuid not null references paises (id) on delete restrict,
  nome text not null,
  sigla text not null,
  tipo text not null check (tipo in ('nacional', 'estadual')),
  unique (pais_id, sigla)
);

create index if not exists idx_paises_confederacao on paises (confederacao_id);
create index if not exists idx_federacoes_pais on federacoes (pais_id);

-- ----------------------------------------------------------------------------
-- torneios
-- ----------------------------------------------------------------------------
create table if not exists torneios (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  federation text not null,          -- free text, consumed by the scraper — never renamed/dropped
  federacao_id uuid references federacoes (id) on delete set null, -- UI navigation only
  category text references categoria_ordem (categoria),
  year smallint not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_torneios_federation on torneios (federation);
create index if not exists idx_torneios_category_year on torneios (category, year);
create index if not exists idx_torneios_federacao_id on torneios (federacao_id);

-- Seed (idempotent): the 6 confederations always exist; Brasil + its national/
-- state federations are the only real product scope today.
insert into confederacoes (continente, codigo, nome) values
  ('América do Sul', 'CONMEBOL', 'Confederação Sul-Americana de Futebol'),
  ('América do Norte, Central e Caribe', 'CONCACAF', 'Confederação de Futebol da América do Norte, Central e Caribe'),
  ('Ásia', 'AFC', 'Confederação Asiática de Futebol'),
  ('África', 'CAF', 'Confederação Africana de Futebol'),
  ('Europa', 'UEFA', 'União das Federações Europeias de Futebol'),
  ('Oceania', 'OFC', 'Confederação de Futebol da Oceania')
on conflict (codigo) do nothing;

insert into paises (confederacao_id, nome, codigo)
select id, 'Brasil', 'BR' from confederacoes where codigo = 'CONMEBOL'
on conflict (confederacao_id, nome) do nothing;

insert into federacoes (pais_id, nome, sigla, tipo)
select p.id, v.nome, v.sigla, v.tipo
from paises p
cross join (values
  ('Confederação Brasileira de Futebol', 'CBF', 'nacional'),
  ('Federação Paulista de Futebol', 'FPF', 'estadual'),
  ('Federação de Futebol do Rio de Janeiro', 'FERJ', 'estadual'),
  ('Federação Mineira de Futebol', 'FMF', 'estadual')
) as v(nome, sigla, tipo)
where p.nome = 'Brasil'
on conflict (pais_id, sigla) do nothing;

update torneios t set federacao_id = f.id
from federacoes f
where t.federacao_id is null and f.sigla = t.federation;

-- ----------------------------------------------------------------------------
-- conquistas (títulos + prêmios individuais)
-- ----------------------------------------------------------------------------
create table if not exists conquistas (
  id uuid primary key default gen_random_uuid(),
  bid_atleta bigint not null references atletas (bid) on delete cascade,
  tipo text not null check (tipo in ('titulo', 'premio')),
  descricao text not null,
  ano smallint,
  torneio_id uuid references torneios (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_conquistas_bid on conquistas (bid_atleta);

-- ----------------------------------------------------------------------------
-- historico_clubes (career club history — previous clubs beyond current_club_id)
-- ----------------------------------------------------------------------------
create table if not exists historico_clubes (
  id uuid primary key default gen_random_uuid(),
  bid_atleta bigint not null references atletas (bid) on delete cascade,
  clube_id uuid references clubes (id) on delete set null, -- null if the club isn't a base seed profile
  clube_nome text not null,                                -- denormalized (previous clubs may not exist as `clubes` rows)
  ano_inicio smallint,
  ano_fim smallint,                                        -- null = current club
  created_at timestamptz not null default now()
);

create index if not exists idx_historico_bid on historico_clubes (bid_atleta);

-- ----------------------------------------------------------------------------
-- scraping_logs (ingestion audit trail)
-- ----------------------------------------------------------------------------
create table if not exists scraping_logs (
  id uuid primary key default gen_random_uuid(),
  source text not null,                  -- 'CBF', 'FPF', 'FERJ', ...
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

-- ----------------------------------------------------------------------------
-- scraping_jobs (Fase 6.4 — per-item retry queue, idempotent/incremental)
-- ----------------------------------------------------------------------------
create table if not exists scraping_jobs (
  id uuid primary key default gen_random_uuid(),
  source text not null,                          -- 'CBF', 'FPF', 'FERJ', ...
  job_type text not null,                        -- 'sumula' | 'registry' | 'profile'
  ref text not null,                             -- stable identifier (código/edicaoId/bid)
  status text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  attempts integer not null default 0,
  last_error text,
  payload jsonb,
  scraping_log_id uuid references scraping_logs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, job_type, ref)
);

create index if not exists idx_scraping_jobs_status on scraping_jobs (status, source);
create index if not exists idx_scraping_jobs_updated on scraping_jobs (updated_at desc);

create or replace trigger trg_scraping_jobs_updated_at
  before update on scraping_jobs
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- atleta_fontes (Fase 6.4 — multi-source identity map; single profile per BID)
-- ----------------------------------------------------------------------------
create table if not exists atleta_fontes (
  bid bigint not null references atletas (bid) on delete cascade,
  fonte text not null,                           -- 'cbf', 'fpf', 'ferj', ...
  id_externo text not null,                      -- athlete id in that source
  confidence text not null default 'exact' check (confidence in ('exact', 'matched', 'manual')),
  resolved_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (fonte, id_externo)
);

create index if not exists idx_atleta_fontes_bid on atleta_fontes (bid);

-- ----------------------------------------------------------------------------
-- partidas_sumula (one row per match, parent of atuacoes_sumula)
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- atuacoes_sumula (one row per player appearance in a match)
-- ----------------------------------------------------------------------------
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
  clean_sheet boolean not null default false,  -- goalkeeper kept a clean sheet
  created_at timestamptz not null default now(),
  unique (partida_id, bid_atleta)
);

create index if not exists idx_atuacoes_bid on atuacoes_sumula (bid_atleta);
create index if not exists idx_atuacoes_partida on atuacoes_sumula (partida_id);

-- ----------------------------------------------------------------------------
-- favoritos (user's shortlist + rating; drives tactical-board bench ranking)
-- ----------------------------------------------------------------------------
create table if not exists favoritos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  bid_atleta bigint not null references atletas (bid) on delete cascade,
  nota smallint check (nota between 0 and 100),  -- user's rating, best->worst
  notas text,                                    -- free-text scouting note
  created_at timestamptz not null default now(),
  unique (user_id, bid_atleta)
);

create index if not exists idx_favoritos_user on favoritos (user_id);
create index if not exists idx_favoritos_bid on favoritos (bid_atleta);

-- ----------------------------------------------------------------------------
-- prancheta_tatica (tactical board) + slots
-- ----------------------------------------------------------------------------
create table if not exists prancheta_tatica (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  name text not null default 'Minha Prancheta',
  lineup_initialized boolean not null default false,
  formation text not null default '4-3-3'
    check (formation in ('4-3-3', '4-4-2', '3-5-2', '4-2-3-1')),
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
  position_code text,                    -- 'GK','RB',... for starters; null for bench
  slot_order smallint not null default 0,
  created_at timestamptz not null default now(),
  unique (prancheta_id, bid_atleta),
  unique (prancheta_id, slot_type, slot_order),
  constraint prancheta_slot_position_valid check (
    (slot_type = 'starter'
      and position_code in ('GK','CB','LB','RB','DM','CM','AM','LW','RW','ST'))
    or (slot_type = 'bench' and position_code is null)
  )
);

create index if not exists idx_prancheta_slots_board on prancheta_slots (prancheta_id);

-- ----------------------------------------------------------------------------
-- solicitacoes_reivindicacao (ownership requests: athlete OR club claims)
-- ----------------------------------------------------------------------------
create table if not exists solicitacoes_reivindicacao (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('atleta', 'clube')),
  bid_atleta bigint references atletas (bid) on delete cascade,
  clube_id uuid references clubes (id) on delete cascade,
  requested_by uuid not null references auth.users (id) on delete cascade,
  documento_url text,
  mensagem text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint reivindicacao_target_matches_tipo check (
    (tipo = 'atleta' and bid_atleta is not null and clube_id is null)
    or (tipo = 'clube' and clube_id is not null and bid_atleta is null)
  )
);

create index if not exists idx_reivindicacao_requester on solicitacoes_reivindicacao (requested_by);
create index if not exists idx_reivindicacao_status on solicitacoes_reivindicacao (status);
create index if not exists idx_reivindicacao_tipo on solicitacoes_reivindicacao (tipo);
create unique index if not exists idx_reivindicacao_clube_pending_requester
  on solicitacoes_reivindicacao (requested_by)
  where tipo = 'clube' and status = 'pending';
create unique index if not exists idx_reivindicacao_clube_pending_target
  on solicitacoes_reivindicacao (clube_id)
  where tipo = 'clube' and status = 'pending';
create unique index if not exists idx_clubes_claimed_user
  on clubes (reivindicado_por)
  where reivindicado_por is not null;
create unique index if not exists idx_reivindicacao_atleta_pending_target
  on solicitacoes_reivindicacao (bid_atleta)
  where tipo = 'atleta' and status = 'pending';

alter table solicitacoes_reivindicacao
  add constraint reivindicacao_clube_documento_required
  check (
    tipo <> 'clube'
    or (
      documento_url is not null
      and char_length(documento_url) <= 1000
      and documento_url ~* '^https?://[^[:space:]]+$'
    )
  );
alter table solicitacoes_reivindicacao
  add constraint reivindicacao_clube_mensagem_required
  check (
    tipo <> 'clube'
    or char_length(btrim(coalesce(mensagem, ''))) between 20 and 2000
  );
alter table solicitacoes_reivindicacao
  add constraint reivindicacao_atleta_documento_required
  check (tipo <> 'atleta' or (documento_url is not null and char_length(documento_url) <= 1000 and documento_url ~* '^https?://[^[:space:]]+$'));
alter table solicitacoes_reivindicacao
  add constraint reivindicacao_atleta_mensagem_required
  check (tipo <> 'atleta' or char_length(btrim(coalesce(mensagem, ''))) between 20 and 2000);

create or replace function prepare_club_claim_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_role text;
  v_account_status text;
  v_club_status text;
begin
  if new.tipo <> 'clube' then return new; end if;
  if (select auth.uid()) is not null
    and new.requested_by is distinct from (select auth.uid())
    and not private.is_admin()
  then raise exception 'claim requester must match authenticated user'; end if;
  new.status := 'pending';
  new.reviewed_by := null;
  new.reviewed_at := null;
  select p.role, p.account_status into v_profile_role, v_account_status
  from profiles p where p.id = new.requested_by;
  if v_profile_role is distinct from 'club' or v_account_status is distinct from 'approved' then
    raise exception 'only approved club accounts may claim clubs';
  end if;
  if exists (select 1 from clubes c where c.reivindicado_por = new.requested_by) then
    raise exception 'account already represents a club';
  end if;
  select c.claim_status into v_club_status from clubes c where c.id = new.clube_id for update;
  if not found then raise exception 'club not found'; end if;
  if v_club_status is distinct from 'unclaimed' then raise exception 'club is not available for claim'; end if;
  update clubes set claim_status = 'pending' where id = new.clube_id;
  return new;
end;
$$;

create or replace function guard_claim_request_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (to_jsonb(new) - array['status', 'reviewed_by', 'reviewed_at']::text[])
    is distinct from (to_jsonb(old) - array['status', 'reviewed_by', 'reviewed_at']::text[])
  then raise exception 'claim request identity and evidence are immutable'; end if;
  if old.status <> 'pending' and new.status is distinct from old.status then
    raise exception 'reviewed claim requests cannot change status';
  end if;
  if new.status is distinct from old.status then
    if new.status not in ('approved', 'rejected') then raise exception 'invalid claim review transition'; end if;
    if (select auth.uid()) is not null then new.reviewed_by := (select auth.uid()); end if;
    new.reviewed_at := now();
  end if;
  return new;
end;
$$;

create or replace function sync_club_claim_state()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.tipo = 'clube' and new.status is distinct from old.status then
    if new.status = 'approved' then
      update clubes set reivindicado_por = new.requested_by, claim_status = 'claimed'
      where id = new.clube_id and claim_status = 'pending';
      if not found then raise exception 'club claim is no longer pending'; end if;
    elsif new.status = 'rejected' then
      update clubes set reivindicado_por = null, claim_status = 'unclaimed'
      where id = new.clube_id and claim_status = 'pending';
      if not found then raise exception 'club claim is no longer pending'; end if;
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' and old.tipo = 'clube' and old.status = 'pending' then
    update clubes set reivindicado_por = null, claim_status = 'unclaimed'
    where id = old.clube_id and claim_status = 'pending';
    return old;
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function prepare_athlete_claim_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_agent_id uuid; v_status text; v_current_agent uuid;
begin
  if new.tipo <> 'atleta' then return new; end if;
  if (select auth.uid()) is not null and new.requested_by is distinct from (select auth.uid()) then raise exception 'claim requester must match authenticated user'; end if;
  new.status := 'pending'; new.reviewed_by := null; new.reviewed_at := null;
  select a.id into v_agent_id from agentes a join profiles p on p.id=a.user_id where a.user_id=new.requested_by and a.verified_status='verified' and p.role='agent' and p.account_status='approved';
  if v_agent_id is null then raise exception 'only approved verified agents may claim athletes'; end if;
  select at.claim_status,at.agent_id into v_status,v_current_agent from atletas at where at.bid=new.bid_atleta for update;
  if not found then raise exception 'athlete not found'; end if;
  if v_status is distinct from 'unclaimed' or v_current_agent is not null then raise exception 'athlete is not available for claim'; end if;
  return new;
end; $$;

create or replace function mark_athlete_claim_pending()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.tipo='atleta' then
    update atletas set claim_status='pending' where bid=new.bid_atleta and claim_status='unclaimed' and agent_id is null;
    if not found then raise exception 'athlete claim is no longer available'; end if;
  end if;
  return new;
end; $$;

create or replace function sync_athlete_claim_state()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_agent_id uuid;
begin
  if tg_op='UPDATE' and new.tipo='atleta' and new.status is distinct from old.status then
    if new.status='approved' then
      select a.id into v_agent_id from agentes a join profiles p on p.id=a.user_id where a.user_id=new.requested_by and a.verified_status='verified' and p.role='agent' and p.account_status='approved';
      if v_agent_id is null then raise exception 'claiming agent is no longer eligible'; end if;
      update atletas set agent_id=v_agent_id,claim_status='claimed' where bid=new.bid_atleta and claim_status='pending' and agent_id is null;
      if not found then raise exception 'athlete claim is no longer pending'; end if;
    elsif new.status='rejected' then
      update atletas set agent_id=null,claim_status='unclaimed' where bid=new.bid_atleta and claim_status='pending' and agent_id is null;
      if not found then raise exception 'athlete claim is no longer pending'; end if;
    end if;
    return new;
  end if;
  if tg_op='DELETE' and old.tipo='atleta' and old.status='pending' then update atletas set agent_id=null,claim_status='unclaimed' where bid=old.bid_atleta and claim_status='pending' and agent_id is null; return old; end if;
  return coalesce(new,old);
end; $$;

create or replace function guard_atleta_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if private.is_admin() or auth.role()='service_role' then return new; end if;
  if pg_trigger_depth()>1 and old.claim_status='unclaimed' and old.agent_id is null and new.claim_status='pending' and new.agent_id is null
    and (to_jsonb(new)-array['claim_status','updated_at']::text[]) is not distinct from (to_jsonb(old)-array['claim_status','updated_at']::text[])
    and exists (select 1 from solicitacoes_reivindicacao r where r.tipo='atleta' and r.bid_atleta=old.bid and r.requested_by=(select auth.uid()) and r.status='pending') then return new; end if;
  if exists (select 1 from agentes a where a.id=old.agent_id and a.user_id=(select auth.uid()) and a.verified_status='verified' and old.claim_status='claimed') then
    if (to_jsonb(new)-array['apelido','dominant_foot','height_cm','weight_kg','posicao_secundaria','youtube_video_url','updated_at']::text[]) is distinct from (to_jsonb(old)-array['apelido','dominant_foot','height_cm','weight_kg','posicao_secundaria','youtube_video_url','updated_at']::text[]) then raise exception 'agents may only edit apelido, dominant_foot, height_cm, weight_kg, posicao_secundaria and youtube_video_url'; end if;
    return new;
  end if;
  raise exception 'not authorized to update this athlete';
end; $$;

drop trigger if exists trg_prepare_club_claim_insert on solicitacoes_reivindicacao;
create trigger trg_prepare_club_claim_insert before insert on solicitacoes_reivindicacao
  for each row execute function prepare_club_claim_insert();
drop trigger if exists trg_guard_claim_request_update on solicitacoes_reivindicacao;
create trigger trg_guard_claim_request_update before update on solicitacoes_reivindicacao
  for each row execute function guard_claim_request_update();
drop trigger if exists trg_sync_club_claim_state on solicitacoes_reivindicacao;
create trigger trg_sync_club_claim_state after update or delete on solicitacoes_reivindicacao
  for each row execute function sync_club_claim_state();
create trigger trg_prepare_athlete_claim_insert before insert on solicitacoes_reivindicacao for each row execute function prepare_athlete_claim_insert();
create trigger trg_mark_athlete_claim_pending after insert on solicitacoes_reivindicacao for each row execute function mark_athlete_claim_pending();
create trigger trg_sync_athlete_claim_state after update or delete on solicitacoes_reivindicacao for each row execute function sync_athlete_claim_state();
revoke execute on function prepare_club_claim_insert() from public, anon, authenticated;
revoke execute on function guard_claim_request_update() from public, anon, authenticated;
revoke execute on function sync_club_claim_state() from public, anon, authenticated;
revoke execute on function prepare_athlete_claim_insert() from public, anon, authenticated;
revoke execute on function mark_athlete_claim_pending() from public, anon, authenticated;
revoke execute on function sync_athlete_claim_state() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- solicitacoes_correcao (data-correction requests on institutional fields)
-- ----------------------------------------------------------------------------
create table if not exists solicitacoes_correcao (
  id uuid primary key default gen_random_uuid(),
  bid_atleta bigint not null references atletas (bid) on delete cascade,
  requested_by uuid not null references auth.users (id) on delete cascade,
  field_name text not null,
  current_value text,
  suggested_value text not null,
  reason text,
  comprovante_url text,                   -- proof attachment for the correction
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
  ,constraint solicitacoes_reason_required check (reason is not null and btrim(reason) <> '')
  ,constraint solicitacoes_field_allowed check (field_name in (
    'bid', 'fifa_id', 'name', 'birth_date', 'nacionalidade', 'tem_passaporte',
    'passaporte', 'main_position', 'inicio_carreira', 'contract_end_date',
    'current_club_id', 'current_category', 'experiencia_internacional',
    'jogos_suspenso', 'performance_data'
  ))
);

create index if not exists idx_solicitacoes_bid on solicitacoes_correcao (bid_atleta);
create index if not exists idx_solicitacoes_requester on solicitacoes_correcao (requested_by);
create index if not exists idx_solicitacoes_status on solicitacoes_correcao (status);

create or replace function capture_correction_current_value()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_atleta public.atletas%rowtype;
begin
  select * into v_atleta from public.atletas where bid = new.bid_atleta;
  if not found then raise exception 'athlete not found'; end if;
  new.current_value := case
    when new.field_name = 'performance_data' then null
    else to_jsonb(v_atleta) ->> new.field_name
  end;
  return new;
end;
$$;

drop trigger if exists trg_capture_correction_current_value on solicitacoes_correcao;
create trigger trg_capture_correction_current_value
  before insert on solicitacoes_correcao
  for each row execute function capture_correction_current_value();

revoke execute on function capture_correction_current_value() from public, anon, authenticated;

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table categoria_ordem enable row level security;
alter table profiles enable row level security;
alter table clubes enable row level security;
alter table agentes enable row level security;
alter table atletas enable row level security;
alter table conquistas enable row level security;
alter table historico_clubes enable row level security;
alter table confederacoes enable row level security;
alter table paises enable row level security;
alter table federacoes enable row level security;
alter table torneios enable row level security;
alter table scraping_logs enable row level security;
alter table scraping_jobs enable row level security;
alter table atleta_fontes enable row level security;
alter table partidas_sumula enable row level security;
alter table atuacoes_sumula enable row level security;
alter table favoritos enable row level security;
alter table prancheta_tatica enable row level security;
alter table prancheta_slots enable row level security;
alter table solicitacoes_reivindicacao enable row level security;
alter table solicitacoes_correcao enable row level security;

-- categoria_ordem: static reference data.
create policy categoria_ordem_select_approved on categoria_ordem
  for select using (private.is_approved() or private.is_admin());
create policy categoria_ordem_write_admin on categoria_ordem
  for all using (private.is_admin()) with check (private.is_admin());

-- profiles: self-service read/update of own row; admins manage all.
create policy profiles_select_own on profiles
  for select using (id = auth.uid() or private.is_admin());
create policy profiles_update_own on profiles
  for update using (id = auth.uid() or private.is_admin());
create policy profiles_insert_admin on profiles
  for insert to authenticated with check (private.is_admin());

-- clubes: readable by approved accounts; ONLY admin/service writes (no manual
-- creation; ownership is applied by admin on claim approval).
create policy clubes_select_approved on clubes
  -- Wrapped in `(select ...)` (Session 52, applied live via `alter policy`): lets
  -- Postgres evaluate the RLS check once per query (InitPlan) instead of once per
  -- row — confirmed live, this was the difference between a dashboard query on
  -- `view_atleta_resumo` (LATERAL-joins into clubes/atletas/atuacoes/partidas)
  -- succeeding in ~2s vs a `statement timeout` past a few thousand rows. Applies
  -- to every `*_select_approved` policy on the tables that view touches.
  for select using ((select private.is_approved()) or (select private.is_admin()));
create policy clubes_write_admin on clubes
  for all using (private.is_admin()) with check (private.is_admin());

create policy torneios_select_approved on torneios
  for select using ((select private.is_approved()) or (select private.is_admin()));
create policy torneios_write_admin on torneios
  for all using (private.is_admin()) with check (private.is_admin());

create policy confederacoes_select_approved on confederacoes
  for select using (private.is_approved() or private.is_admin());
create policy confederacoes_write_admin on confederacoes
  for all using (private.is_admin()) with check (private.is_admin());
create policy paises_select_approved on paises
  for select using (private.is_approved() or private.is_admin());
create policy paises_write_admin on paises
  for all using (private.is_admin()) with check (private.is_admin());
create policy federacoes_select_approved on federacoes
  for select using (private.is_approved() or private.is_admin());
create policy federacoes_write_admin on federacoes
  for all using (private.is_admin()) with check (private.is_admin());

-- agentes: an agent manages their own row; admins manage/verify all.
create policy agentes_select on agentes
  for select using (user_id = auth.uid() or private.is_approved() or private.is_admin());
create policy agentes_insert_admin on agentes
  for insert to authenticated with check (private.is_admin());
create policy agentes_update_own_or_admin on agentes
  for update using (user_id = auth.uid() or private.is_admin())
  with check (user_id = auth.uid() or private.is_admin());

-- atletas: readable by approved; writes gated by the trigger, RLS admits the
-- two writer classes (admin + verified claiming agent).
create policy atletas_select_approved on atletas
  for select using ((select private.is_approved()) or (select private.is_admin()));
create policy atletas_insert_admin on atletas
  for insert with check (private.is_admin());
create policy atletas_update_admin_or_claiming_agent on atletas
  for update to authenticated using (
    private.is_admin()
    or exists (
      select 1 from agentes a
      where a.id = atletas.agent_id
        and a.user_id = auth.uid()
        and a.verified_status = 'verified'
        and atletas.claim_status = 'claimed'
    )
  ) with check (
    private.is_admin()
    or exists (
      select 1 from agentes a
      where a.id = atletas.agent_id
        and a.user_id = (select auth.uid())
        and a.verified_status = 'verified'
        and atletas.claim_status = 'claimed'
    )
  );
create policy atletas_delete_admin on atletas
  for delete using (private.is_admin());

-- conquistas: readable by approved; admin-only writes.
create policy conquistas_select_approved on conquistas
  for select using ((select private.is_approved()) or (select private.is_admin()));
create policy conquistas_write_admin on conquistas
  for all using (private.is_admin()) with check (private.is_admin());

-- historico_clubes: readable by approved; ingestion/admin-only writes.
create policy historico_select_approved on historico_clubes
  for select using ((select private.is_approved()) or (select private.is_admin()));
create policy historico_write_admin on historico_clubes
  for all using (private.is_admin()) with check (private.is_admin());

-- scraping_logs: admin-only visibility; writes via service_role or admin.
create policy scraping_logs_select_admin on scraping_logs
  for select using (private.is_admin());
create policy scraping_logs_write_admin on scraping_logs
  for all using (private.is_admin()) with check (private.is_admin());

-- scraping_jobs / atleta_fontes: admin-only visibility; writes via service_role or admin.
create policy scraping_jobs_select_admin on scraping_jobs
  for select using (private.is_admin());
create policy scraping_jobs_write_admin on scraping_jobs
  for all using (private.is_admin()) with check (private.is_admin());

create policy atleta_fontes_select_admin on atleta_fontes
  for select using (private.is_admin());
create policy atleta_fontes_write_admin on atleta_fontes
  for all using (private.is_admin()) with check (private.is_admin());

-- partidas_sumula / atuacoes_sumula: read for approved; ingestion-only writes.
create policy partidas_select_approved on partidas_sumula
  for select using ((select private.is_approved()) or (select private.is_admin()));
create policy partidas_write_admin on partidas_sumula
  for all using (private.is_admin()) with check (private.is_admin());

create policy atuacoes_select_approved on atuacoes_sumula
  for select using ((select private.is_approved()) or (select private.is_admin()));
create policy atuacoes_write_admin on atuacoes_sumula
  for all using (private.is_admin()) with check (private.is_admin());

-- favoritos: strictly private to an approved owner.
create policy favoritos_owner_select on favoritos
  for select to authenticated
  using (((select auth.uid()) = user_id and private.is_approved()) or private.is_admin());
create policy favoritos_owner_insert on favoritos
  for insert to authenticated
  with check (((select auth.uid()) = user_id and private.is_approved()) or private.is_admin());
create policy favoritos_owner_update on favoritos
  for update to authenticated
  using (((select auth.uid()) = user_id and private.is_approved()) or private.is_admin())
  with check (((select auth.uid()) = user_id and private.is_approved()) or private.is_admin());
create policy favoritos_owner_delete on favoritos
  for delete to authenticated
  using (((select auth.uid()) = user_id and private.is_approved()) or private.is_admin());

-- prancheta_tatica: one private board per approved owner.
create policy prancheta_owner_select on prancheta_tatica
  for select to authenticated
  using (((select auth.uid()) = user_id and private.is_approved()) or private.is_admin());
create policy prancheta_owner_insert on prancheta_tatica
  for insert to authenticated
  with check (((select auth.uid()) = user_id and private.is_approved()) or private.is_admin());
create policy prancheta_owner_update on prancheta_tatica
  for update to authenticated
  using (((select auth.uid()) = user_id and private.is_approved()) or private.is_admin())
  with check (((select auth.uid()) = user_id and private.is_approved()) or private.is_admin());
create policy prancheta_owner_delete on prancheta_tatica
  for delete to authenticated
  using (((select auth.uid()) = user_id and private.is_approved()) or private.is_admin());

-- prancheta_slots: ownership comes from the board; selected athletes must be favorites.
create policy prancheta_slots_owner_select on prancheta_slots
  for select to authenticated
  using (
    private.is_admin()
    or exists (
      select 1 from prancheta_tatica pt
      where pt.id = prancheta_slots.prancheta_id
        and pt.user_id = (select auth.uid()) and private.is_approved()
    )
  );
create policy prancheta_slots_owner_insert on prancheta_slots
  for insert to authenticated
  with check (
    private.is_admin()
    or (
      exists (
        select 1 from prancheta_tatica pt
        where pt.id = prancheta_slots.prancheta_id
          and pt.user_id = (select auth.uid()) and private.is_approved()
      )
      and exists (
        select 1 from favoritos f
        where f.user_id = (select auth.uid()) and f.bid_atleta = prancheta_slots.bid_atleta
      )
    )
  );
create policy prancheta_slots_owner_update on prancheta_slots
  for update to authenticated
  using (
    private.is_admin()
    or exists (
      select 1 from prancheta_tatica pt
      where pt.id = prancheta_slots.prancheta_id
        and pt.user_id = (select auth.uid()) and private.is_approved()
    )
  )
  with check (
    private.is_admin()
    or (
      exists (
        select 1 from prancheta_tatica pt
        where pt.id = prancheta_slots.prancheta_id
          and pt.user_id = (select auth.uid()) and private.is_approved()
      )
      and exists (
        select 1 from favoritos f
        where f.user_id = (select auth.uid()) and f.bid_atleta = prancheta_slots.bid_atleta
      )
    )
  );
create policy prancheta_slots_owner_delete on prancheta_slots
  for delete to authenticated
  using (
    private.is_admin()
    or exists (
      select 1 from prancheta_tatica pt
      where pt.id = prancheta_slots.prancheta_id
        and pt.user_id = (select auth.uid()) and private.is_approved()
    )
  );

-- Atomic lineup replacement. Runs as the authenticated invoker, so RLS remains active.
create or replace function cleanup_slots_before_favorite_delete()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  delete from prancheta_slots ps
  using prancheta_tatica pt
  where ps.prancheta_id = pt.id
    and pt.user_id = old.user_id
    and ps.bid_atleta = old.bid_atleta;
  return old;
end;
$$;
revoke all on function cleanup_slots_before_favorite_delete() from public, anon, authenticated;
drop trigger if exists trg_favorito_cleanup_slots on favoritos;
create trigger trg_favorito_cleanup_slots
  before delete on favoritos
  for each row execute function cleanup_slots_before_favorite_delete();

drop function if exists replace_prancheta_slots(uuid, jsonb);

create or replace function replace_prancheta_slots(p_board_id uuid, p_formation text, p_slots jsonb)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_count integer;
begin
  if v_user_id is null or not private.is_approved() then
    raise exception 'approved authentication required';
  end if;
  if not exists (
    select 1 from prancheta_tatica where id = p_board_id and user_id = v_user_id
  ) then
    raise exception 'tactical board not found';
  end if;
  if p_formation not in ('4-3-3', '4-4-2', '3-5-2', '4-2-3-1') then
    raise exception 'unsupported formation';
  end if;
  if p_slots is null or jsonb_typeof(p_slots) <> 'array' then
    raise exception 'slots must be a JSON array';
  end if;
  v_count := jsonb_array_length(p_slots);
  if v_count > 11 then
    raise exception 'a tactical board supports at most 11 starters';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_slots)
      as x(bid_atleta bigint, position_code text, slot_order smallint)
    where x.bid_atleta is null
      or x.position_code not in ('GK','CB','LB','RB','DM','CM','AM','LW','RW','ST')
      or x.slot_order not between 0 and 10
  ) then
    raise exception 'invalid tactical-board slot';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_slots)
      as x(bid_atleta bigint, position_code text, slot_order smallint)
    where x.position_code <> case p_formation
      when '4-3-3' then (array['GK','RB','CB','CB','LB','DM','CM','CM','RW','ST','LW'])[x.slot_order + 1]
      when '4-4-2' then (array['GK','RB','CB','CB','LB','RW','CM','CM','LW','ST','ST'])[x.slot_order + 1]
      when '3-5-2' then (array['GK','CB','CB','CB','RW','DM','CM','AM','LW','ST','ST'])[x.slot_order + 1]
      when '4-2-3-1' then (array['GK','RB','CB','CB','LB','DM','DM','RW','AM','LW','ST'])[x.slot_order + 1]
    end
  ) then
    raise exception 'slot position does not match formation';
  end if;
  if (
    select count(distinct x.bid_atleta) from jsonb_to_recordset(p_slots)
      as x(bid_atleta bigint, position_code text, slot_order smallint)
  ) <> v_count then
    raise exception 'an athlete cannot occupy multiple slots';
  end if;
  if (
    select count(distinct x.slot_order) from jsonb_to_recordset(p_slots)
      as x(bid_atleta bigint, position_code text, slot_order smallint)
  ) <> v_count then
    raise exception 'slot_order must be unique';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_slots)
      as x(bid_atleta bigint, position_code text, slot_order smallint)
    where not exists (
      select 1 from favoritos f where f.user_id = v_user_id and f.bid_atleta = x.bid_atleta
    )
  ) then
    raise exception 'only favorited athletes may be selected';
  end if;
  delete from prancheta_slots where prancheta_id = p_board_id;
  update prancheta_tatica set formation = p_formation, lineup_initialized = true
  where id = p_board_id and user_id = v_user_id;
  insert into prancheta_slots (prancheta_id, bid_atleta, slot_type, position_code, slot_order)
  select p_board_id, x.bid_atleta, 'starter', x.position_code, x.slot_order
  from jsonb_to_recordset(p_slots)
    as x(bid_atleta bigint, position_code text, slot_order smallint);
end;
$$;
revoke all on function replace_prancheta_slots(uuid, text, jsonb) from public, anon;
grant execute on function replace_prancheta_slots(uuid, text, jsonb) to authenticated, service_role;

create or replace function remove_favorite_and_slot(p_bid bigint)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null or not private.is_approved() then
    raise exception 'approved authentication required';
  end if;
  delete from prancheta_slots ps
  using prancheta_tatica pt
  where ps.prancheta_id = pt.id and pt.user_id = v_user_id and ps.bid_atleta = p_bid;
  delete from favoritos where user_id = v_user_id and bid_atleta = p_bid;
end;
$$;
revoke all on function remove_favorite_and_slot(bigint) from public, anon;
grant execute on function remove_favorite_and_slot(bigint) to authenticated, service_role;

-- solicitacoes_reivindicacao: requester files + sees own; admin reviews all.
create policy reivindicacao_select_own_or_admin on solicitacoes_reivindicacao
  for select using (requested_by = auth.uid() or private.is_admin());
create policy reivindicacao_insert_own on solicitacoes_reivindicacao
  for insert to authenticated with check (
    requested_by = (select auth.uid())
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
    and (
      (
        tipo = 'clube' and bid_atleta is null and clube_id is not null
        and exists (
          select 1 from profiles p where p.id = (select auth.uid())
            and p.role = 'club' and p.account_status = 'approved'
        )
        and exists (
          select 1 from clubes c where c.id = solicitacoes_reivindicacao.clube_id
            and c.claim_status in ('unclaimed', 'pending')
        )
        and not exists (
          select 1 from clubes c where c.reivindicado_por = (select auth.uid())
        )
      )
      or (
        tipo = 'atleta' and bid_atleta is not null and clube_id is null
        and exists (
          select 1 from agentes a join profiles p on p.id = a.user_id
          where a.user_id = (select auth.uid()) and a.verified_status = 'verified'
            and p.role = 'agent' and p.account_status = 'approved'
        )
        and exists (
          select 1 from atletas at where at.bid = solicitacoes_reivindicacao.bid_atleta
            and at.agent_id is null and at.claim_status in ('unclaimed', 'pending')
        )
      )
    )
  );
create policy reivindicacao_update_admin on solicitacoes_reivindicacao
  for update using (private.is_admin()) with check (private.is_admin());
create policy reivindicacao_delete_admin on solicitacoes_reivindicacao
  for delete using (private.is_admin());

-- solicitacoes_correcao: requester files + sees own; admin reviews all.
create policy solicitacoes_select_own_or_admin on solicitacoes_correcao
  for select using (requested_by = auth.uid() or private.is_admin());
create policy solicitacoes_insert_own on solicitacoes_correcao
  for insert to authenticated with check (
    requested_by = (select auth.uid())
    and exists (
      select 1 from agentes a
      join atletas at on at.agent_id = a.id
      join profiles p on p.id = a.user_id
      where a.user_id = (select auth.uid())
        and a.verified_status = 'verified'
        and at.bid = solicitacoes_correcao.bid_atleta
        and at.claim_status = 'claimed'
        and p.role = 'agent'
        and p.account_status = 'approved'
    )
  );
create policy solicitacoes_update_admin on solicitacoes_correcao
  for update using (private.is_admin()) with check (private.is_admin());
create policy solicitacoes_delete_admin on solicitacoes_correcao
  for delete using (private.is_admin());

-- ============================================================================
-- view_atleta_resumo — aggregated player summary for search/list/dossier
-- ============================================================================
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
  stats.total_matches,
  stats.total_minutes,
  stats.total_goals,
  stats.total_assists,
  (stats.total_goals + stats.total_assists) as participacoes_gol,
  stats.total_yellow_cards,
  stats.total_red_cards,
  stats.total_clean_sheets,
  stats.times_played_above_category,
  (stats.times_played_above_category > 0) as ja_jogou_categoria_acima,
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

-- ============================================================================
-- view_clube_resumo — seed-profile summary (squad + active categories/tourneys)
-- ============================================================================
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
  coalesce(mp.torneios_em_disputa, '{}'::text[]) as torneios_em_disputa
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

-- ----------------------------------------------------------------------------
-- Phase 4.4: claimed-club management panel
-- ----------------------------------------------------------------------------
-- FOOTBASE Phase 4.4: claimed-club management panel.
-- Additive only: club declarations and requests never mutate official athlete data.

alter table public.clubes
  add column if not exists cnpj text,
  add column if not exists display_name text,
  add column if not exists description text,
  add column if not exists headquarters_address text,
  add column if not exists headquarters_city text,
  add column if not exists headquarters_state char(2),
  add column if not exists phone text,
  add column if not exists whatsapp text,
  add column if not exists contact_email text,
  add column if not exists website_url text,
  add column if not exists instagram_url text,
  add column if not exists crest_storage_path text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.clubes drop constraint if exists clubes_display_name_length;
alter table public.clubes add constraint clubes_display_name_length check (display_name is null or char_length(display_name) <= 160);
alter table public.clubes drop constraint if exists clubes_description_length;
alter table public.clubes add constraint clubes_description_length check (description is null or char_length(description) <= 1200);
alter table public.clubes drop constraint if exists clubes_operational_fields_length;
alter table public.clubes add constraint clubes_operational_fields_length check (
  (headquarters_address is null or char_length(headquarters_address) <= 300)
  and (headquarters_city is null or char_length(headquarters_city) <= 120)
  and (phone is null or char_length(phone) <= 40)
  and (whatsapp is null or char_length(whatsapp) <= 40)
  and (contact_email is null or char_length(contact_email) <= 254)
  and (website_url is null or char_length(website_url) <= 500)
  and (instagram_url is null or char_length(instagram_url) <= 500)
  and (crest_storage_path is null or char_length(crest_storage_path) <= 500)
);
alter table public.clubes drop constraint if exists clubes_headquarters_state_format;
alter table public.clubes add constraint clubes_headquarters_state_format check (headquarters_state is null or headquarters_state ~ '^[A-Z]{2}$');

create or replace function private.owns_claimed_club(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.clubes c
    join public.profiles p on p.id = c.reivindicado_por
    where c.id = p_club_id
      and c.reivindicado_por = (select auth.uid())
      and c.claim_status = 'claimed'
      and p.role = 'club'
      and p.account_status = 'approved'
  );
$$;
revoke execute on function private.owns_claimed_club(uuid) from public, anon;
grant execute on function private.owns_claimed_club(uuid) to authenticated, service_role;

create or replace function public.guard_clube_operational_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if private.is_admin() or auth.role() = 'service_role' then return new; end if;
  -- Updates issued from WITHIN another trigger (e.g. the Phase 4.2 club-claim
  -- triggers that transition claim_status/reivindicado_por) run nested, at trigger
  -- depth > 1. Only a direct client update (depth 1) is held to the operational
  -- allowlist below. (current_user cannot be used here: this guard is itself
  -- SECURITY DEFINER, so current_user is always the function owner.)
  if pg_trigger_depth() > 1 then return new; end if;
  if not private.owns_claimed_club(old.id) then raise exception 'not authorized to update this club'; end if;
  if (to_jsonb(new) - array[
      'display_name','description','headquarters_address','headquarters_city',
      'headquarters_state','phone','whatsapp','contact_email','website_url',
      'instagram_url','updated_at'
    ]::text[]) is distinct from
    (to_jsonb(old) - array[
      'display_name','description','headquarters_address','headquarters_city',
      'headquarters_state','phone','whatsapp','contact_email','website_url',
      'instagram_url','updated_at'
    ]::text[])
  then raise exception 'club may only edit operational profile fields'; end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists trg_guard_clube_operational_update on public.clubes;
create trigger trg_guard_clube_operational_update before update on public.clubes
for each row execute function public.guard_clube_operational_update();
revoke execute on function public.guard_clube_operational_update() from public, anon, authenticated;

drop policy if exists clubes_update_claimed_owner on public.clubes;
create policy clubes_update_claimed_owner on public.clubes
for update to authenticated
using (private.owns_claimed_club(id))
with check (private.owns_claimed_club(id));

create table if not exists public.club_categorias (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubes(id) on delete cascade,
  category text not null references public.categoria_ordem(categoria),
  status text not null default 'active' check (status in ('active','archived')),
  display_order smallint not null default 0 check (display_order between 0 and 100),
  source_status text not null default 'club_declared' check (source_status in ('club_declared','admin_confirmed','official_confirmed')),
  declared_by uuid not null references auth.users(id) on delete restrict,
  confirmed_by uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (club_id, category)
);
create index if not exists idx_club_categorias_club on public.club_categorias(club_id, status, display_order);

create table if not exists public.club_categoria_torneios (
  id uuid primary key default gen_random_uuid(),
  club_category_id uuid not null references public.club_categorias(id) on delete cascade,
  tournament_id uuid references public.torneios(id) on delete set null,
  declared_name text,
  season text not null check (char_length(btrim(season)) between 1 and 30),
  start_date date,
  end_date date,
  status text not null default 'registered' check (status in ('registered','in_progress','finished','withdrawn')),
  source_status text not null default 'club_declared' check (source_status in ('club_declared','admin_confirmed','official_confirmed')),
  declared_by uuid not null references auth.users(id) on delete restrict,
  confirmed_by uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint club_tournament_name_present check (tournament_id is not null or char_length(btrim(coalesce(declared_name,''))) between 2 and 180),
  constraint club_tournament_dates_ordered check (start_date is null or end_date is null or end_date >= start_date)
);
create index if not exists idx_club_torneios_category on public.club_categoria_torneios(club_category_id, status);

create table if not exists public.club_elenco_solicitacoes (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubes(id) on delete restrict,
  bid_atleta bigint references public.atletas(bid) on delete restrict,
  informed_bid text,
  informed_name text,
  action text not null check (action in ('add','remove','change_category','register_missing_bid')),
  current_club_id_snapshot uuid references public.clubes(id) on delete set null,
  current_category_snapshot text,
  proposed_category text references public.categoria_ordem(categoria),
  justification text not null check (char_length(btrim(justification)) between 20 and 2000),
  evidence_url text check (evidence_url is null or (char_length(evidence_url) <= 1000 and evidence_url ~* '^https?://[^[:space:]]+$')),
  status text not null default 'pending' check (status in ('pending','approved','rejected','conflict')),
  requested_by uuid not null references auth.users(id) on delete restrict,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint club_roster_target_valid check (
    (action = 'register_missing_bid' and bid_atleta is null and informed_bid is not null and informed_name is not null and proposed_category is not null)
    or (action <> 'register_missing_bid' and bid_atleta is not null)
  ),
  constraint club_roster_category_valid check (
    (action in ('add','change_category','register_missing_bid') and proposed_category is not null)
    or (action = 'remove' and proposed_category is null)
  )
);
create index if not exists idx_club_roster_requests_club on public.club_elenco_solicitacoes(club_id, status, created_at desc);
create unique index if not exists idx_club_roster_pending_existing on public.club_elenco_solicitacoes(club_id, bid_atleta, action)
where status = 'pending' and bid_atleta is not null;
create unique index if not exists idx_club_roster_pending_missing on public.club_elenco_solicitacoes(club_id, informed_bid)
where status = 'pending' and action = 'register_missing_bid';

create table if not exists public.club_correction_requests (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubes(id) on delete restrict,
  field_name text not null check (field_name in ('name','cnpj','state','federacao','source_key','crest')),
  current_value text,
  suggested_value text not null check (char_length(btrim(suggested_value)) between 1 and 500),
  reason text not null check (char_length(btrim(reason)) between 20 and 2000),
  evidence_url text check (evidence_url is null or (char_length(evidence_url) <= 1000 and evidence_url ~* '^https?://[^[:space:]]+$')),
  status text not null default 'pending' check (status in ('pending','approved','rejected','conflict')),
  requested_by uuid not null references auth.users(id) on delete restrict,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);
create index if not exists idx_club_corrections_club on public.club_correction_requests(club_id, status, created_at desc);
create unique index if not exists idx_club_correction_pending on public.club_correction_requests(club_id, field_name) where status = 'pending';

create table if not exists public.club_divergencias (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubes(id) on delete restrict,
  domain text not null check (domain in ('profile','roster','category','tournament')),
  entity_key text,
  field_name text,
  declared_value jsonb,
  official_value jsonb,
  official_source text not null,
  status text not null default 'open' check (status in ('open','resolved_club','resolved_official','dismissed')),
  resolution_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_club_divergencias_club on public.club_divergencias(club_id, status, created_at desc);

create or replace function public.prepare_club_category_write()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if private.is_admin() or auth.role() = 'service_role' then return new; end if;
  if not private.owns_claimed_club(coalesce(old.club_id, new.club_id)) then raise exception 'not authorized for this club'; end if;
  if tg_op = 'INSERT' then
    new.declared_by := auth.uid(); new.source_status := 'club_declared'; new.confirmed_by := null; new.confirmed_at := null;
  elsif (to_jsonb(new) - array['status','display_order','updated_at']::text[]) is distinct from (to_jsonb(old) - array['status','display_order','updated_at']::text[]) then
    raise exception 'club may only edit category status and order';
  end if;
  new.updated_at := now(); return new;
end; $$;
create or replace function public.prepare_club_tournament_write()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_club_id uuid;
begin
  select club_id into v_club_id from public.club_categorias where id = new.club_category_id;
  if private.is_admin() or auth.role() = 'service_role' then return new; end if;
  if not private.owns_claimed_club(v_club_id) then raise exception 'not authorized for this club'; end if;
  if tg_op = 'INSERT' then
    new.tournament_id := null; new.declared_by := auth.uid(); new.source_status := 'club_declared'; new.confirmed_by := null; new.confirmed_at := null;
  elsif (to_jsonb(new) - array['declared_name','season','start_date','end_date','status','updated_at']::text[]) is distinct from (to_jsonb(old) - array['declared_name','season','start_date','end_date','status','updated_at']::text[]) then
    raise exception 'club may only edit declared tournament fields';
  end if;
  new.updated_at := now(); return new;
end; $$;
create or replace function public.prepare_club_roster_request()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_club_id uuid; v_profile_role text; v_profile_status text;
begin
  if private.is_admin() or auth.role() = 'service_role' then return new; end if;
  select c.id, p.role, p.account_status into v_club_id, v_profile_role, v_profile_status
  from public.clubes c join public.profiles p on p.id = c.reivindicado_por
  where c.reivindicado_por = auth.uid() and c.claim_status = 'claimed';
  if v_club_id is null or v_profile_role <> 'club' or v_profile_status <> 'approved' then raise exception 'claimed club required'; end if;
  new.club_id := v_club_id; new.requested_by := auth.uid(); new.status := 'pending';
  new.reviewed_by := null; new.reviewed_at := null; new.review_note := null;
  if new.bid_atleta is not null then
    select current_club_id, current_category into new.current_club_id_snapshot, new.current_category_snapshot from public.atletas where bid = new.bid_atleta;
    if not found then raise exception 'athlete not found'; end if;
  else
    new.current_club_id_snapshot := null; new.current_category_snapshot := null;
  end if;
  return new;
end; $$;
create or replace function public.prepare_club_correction_request()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_club public.clubes%rowtype;
begin
  if private.is_admin() or auth.role() = 'service_role' then return new; end if;
  select c.* into v_club from public.clubes c where c.reivindicado_por = auth.uid() and c.claim_status = 'claimed';
  if v_club.id is null or not private.owns_claimed_club(v_club.id) then raise exception 'claimed club required'; end if;
  new.club_id := v_club.id; new.requested_by := auth.uid(); new.status := 'pending';
  new.reviewed_by := null; new.reviewed_at := null; new.review_note := null;
  new.current_value := case new.field_name when 'name' then v_club.name when 'cnpj' then v_club.cnpj when 'state' then v_club.state::text when 'federacao' then v_club.federacao when 'source_key' then v_club.source_key when 'crest' then coalesce(v_club.webp_crest_url, v_club.crest_storage_path) end;
  return new;
end; $$;
create or replace function public.guard_club_request_update()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if private.is_admin() or auth.role() = 'service_role' then return new; end if;
  raise exception 'club requests are immutable';
end; $$;

drop trigger if exists trg_club_category_write on public.club_categorias;
create trigger trg_club_category_write before insert or update on public.club_categorias for each row execute function public.prepare_club_category_write();
drop trigger if exists trg_club_tournament_write on public.club_categoria_torneios;
create trigger trg_club_tournament_write before insert or update on public.club_categoria_torneios for each row execute function public.prepare_club_tournament_write();
drop trigger if exists trg_club_roster_request_insert on public.club_elenco_solicitacoes;
create trigger trg_club_roster_request_insert before insert on public.club_elenco_solicitacoes for each row execute function public.prepare_club_roster_request();
drop trigger if exists trg_club_roster_request_update on public.club_elenco_solicitacoes;
create trigger trg_club_roster_request_update before update on public.club_elenco_solicitacoes for each row execute function public.guard_club_request_update();
drop trigger if exists trg_club_correction_insert on public.club_correction_requests;
create trigger trg_club_correction_insert before insert on public.club_correction_requests for each row execute function public.prepare_club_correction_request();
drop trigger if exists trg_club_correction_update on public.club_correction_requests;
create trigger trg_club_correction_update before update on public.club_correction_requests for each row execute function public.guard_club_request_update();

revoke execute on function public.prepare_club_category_write() from public, anon, authenticated;
revoke execute on function public.prepare_club_tournament_write() from public, anon, authenticated;
revoke execute on function public.prepare_club_roster_request() from public, anon, authenticated;
revoke execute on function public.prepare_club_correction_request() from public, anon, authenticated;
revoke execute on function public.guard_club_request_update() from public, anon, authenticated;

alter table public.club_categorias enable row level security;
alter table public.club_categoria_torneios enable row level security;
alter table public.club_elenco_solicitacoes enable row level security;
alter table public.club_correction_requests enable row level security;
alter table public.club_divergencias enable row level security;

create policy club_categories_select on public.club_categorias for select to authenticated using (private.owns_claimed_club(club_id) or private.is_admin());
-- Categories/tournaments/roster: read by owner+admin, but WRITE is admin-only
-- (UI curation) + service_role (súmula ingestion). Clubs no longer declare these;
-- the panel is read-only. Institutional corrections remain club-writable below.
create policy club_categories_insert on public.club_categorias for insert to authenticated with check (private.is_admin());
create policy club_categories_update on public.club_categorias for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy club_tournaments_select on public.club_categoria_torneios for select to authenticated using (private.is_admin() or exists (select 1 from public.club_categorias cc where cc.id = club_category_id and private.owns_claimed_club(cc.club_id)));
create policy club_tournaments_insert on public.club_categoria_torneios for insert to authenticated with check (private.is_admin());
create policy club_tournaments_update on public.club_categoria_torneios for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy club_roster_requests_select on public.club_elenco_solicitacoes for select to authenticated using (private.owns_claimed_club(club_id) or private.is_admin());
create policy club_roster_requests_insert on public.club_elenco_solicitacoes for insert to authenticated with check (private.is_admin());
create policy club_roster_requests_admin_update on public.club_elenco_solicitacoes for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy club_corrections_select on public.club_correction_requests for select to authenticated using (private.owns_claimed_club(club_id) or private.is_admin());
create policy club_corrections_insert on public.club_correction_requests for insert to authenticated with check (private.owns_claimed_club(club_id) or private.is_admin());
create policy club_corrections_admin_update on public.club_correction_requests for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy club_divergences_select on public.club_divergencias for select to authenticated using (private.owns_claimed_club(club_id) or private.is_admin());
create policy club_divergences_admin_write on public.club_divergencias for all to authenticated using (private.is_admin()) with check (private.is_admin());

-- Private bucket: only the authenticated server route writes through service_role
-- after validating ownership, file signature, dimensions and final WebP size.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('club-crests', 'club-crests', false, 51200, array['image/webp'])
on conflict (id) do update set public = false, file_size_limit = 51200, allowed_mime_types = array['image/webp'];

drop policy if exists club_crests_admin_read on storage.objects;
create policy club_crests_admin_read on storage.objects for select to authenticated
using (bucket_id = 'club-crests' and private.is_admin());

comment on table public.club_elenco_solicitacoes is 'Club-declared roster requests. Only a later administrative approval may mutate atletas.';

-- ----------------------------------------------------------------------------
-- Fase 5.7 — transferência administrativa de representação (dedicated, audited)
-- ----------------------------------------------------------------------------
create table if not exists representacao_transferencias (
  id uuid primary key default gen_random_uuid(),
  bid_atleta bigint not null references atletas (bid) on delete cascade,
  agente_anterior_id uuid references agentes (id) on delete set null,
  agente_novo_id uuid not null references agentes (id) on delete restrict,
  justificativa text not null check (char_length(justificativa) between 20 and 2000),
  comprovante_url text not null check (comprovante_url ~ '^https?://'),
  admin_id uuid not null references profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists idx_representacao_transferencias_bid on representacao_transferencias (bid_atleta);
create index if not exists idx_representacao_transferencias_created on representacao_transferencias (created_at desc);

alter table representacao_transferencias enable row level security;

create policy representacao_transferencias_select_admin on representacao_transferencias
  for select using (private.is_admin());

-- The ONLY sanctioned way to change agent_id on an already-represented athlete.
-- Atomic: validates the new agent, updates atletas, records history. No insert/
-- update/delete RLS policy exists for authenticated/anon — the table is
-- append-only, written exclusively by this SECURITY DEFINER function.
create or replace function admin_transferir_representacao(
  p_bid bigint,
  p_novo_agente_id uuid,
  p_justificativa text,
  p_comprovante_url text
) returns representacao_transferencias
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anterior uuid;
  v_status text;
  v_novo_ok boolean;
  v_result representacao_transferencias;
begin
  if not (private.is_admin() or auth.role() = 'service_role') then
    raise exception 'only admins may transfer athlete representation';
  end if;

  if p_justificativa is null or char_length(trim(p_justificativa)) < 20 or char_length(p_justificativa) > 2000 then
    raise exception 'justificativa must be 20..2000 characters';
  end if;
  if p_comprovante_url is null or p_comprovante_url !~ '^https?://' then
    raise exception 'comprovante_url must be an http(s) URL';
  end if;

  select agent_id, claim_status into v_anterior, v_status
  from atletas where bid = p_bid for update;
  if not found then raise exception 'athlete % not found', p_bid; end if;
  if v_status <> 'claimed' or v_anterior is null then
    raise exception 'athlete % has no current agent to transfer representation from', p_bid;
  end if;
  if v_anterior = p_novo_agente_id then
    raise exception 'the new agent must differ from the current agent';
  end if;

  select exists (
    select 1 from agentes a
    join profiles p on p.id = a.user_id
    where a.id = p_novo_agente_id
      and a.verified_status = 'verified'
      and p.role = 'agent'
      and p.account_status = 'approved'
  ) into v_novo_ok;
  if not v_novo_ok then
    raise exception 'new agent must be an approved, verified agent';
  end if;

  update atletas set agent_id = p_novo_agente_id, claim_status = 'claimed' where bid = p_bid;

  insert into representacao_transferencias
    (bid_atleta, agente_anterior_id, agente_novo_id, justificativa, comprovante_url, admin_id)
  values
    (p_bid, v_anterior, p_novo_agente_id, p_justificativa, p_comprovante_url, auth.uid())
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function admin_transferir_representacao(bigint, uuid, text, text) from public, anon;
grant execute on function admin_transferir_representacao(bigint, uuid, text, text) to authenticated, service_role;
comment on table public.club_divergencias is 'Conflict layer for club declarations versus official/admin/scraper observations; ingestion must not overwrite declarations.';

-- ----------------------------------------------------------------------------
-- admin_promocoes — auditable "promote a user to admin" (guard_profile_update
-- already lets any admin UPDATE profiles.role directly; this layers business
-- rules + an immutable history on top of that existing access). Deliberately
-- promotion-only — no demote/remove path; that stays manual, outside any AI
-- assistant's reach by design.
-- ----------------------------------------------------------------------------
create table if not exists admin_promocoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  justificativa text not null check (char_length(justificativa) between 20 and 2000),
  promovido_por uuid not null references profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_promocoes_user on admin_promocoes (user_id);
create index if not exists idx_admin_promocoes_created on admin_promocoes (created_at desc);

alter table admin_promocoes enable row level security;

create policy admin_promocoes_select_admin on admin_promocoes
  for select using (private.is_admin());

create or replace function admin_promover_para_admin(
  p_user_id uuid,
  p_justificativa text
) returns admin_promocoes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_status text;
  v_result admin_promocoes;
begin
  if not (private.is_admin() or auth.role() = 'service_role') then
    raise exception 'only admins may promote a user to admin';
  end if;

  if p_justificativa is null or char_length(trim(p_justificativa)) < 20 or char_length(p_justificativa) > 2000 then
    raise exception 'justificativa must be 20..2000 characters';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'admins cannot promote themselves';
  end if;

  select role, account_status into v_role, v_status from profiles where id = p_user_id for update;
  if not found then raise exception 'user % not found', p_user_id; end if;
  if v_role = 'admin' then raise exception 'user % is already an admin', p_user_id; end if;
  if v_status <> 'approved' then raise exception 'user % must be approved before becoming admin', p_user_id; end if;

  update profiles set role = 'admin' where id = p_user_id;

  insert into admin_promocoes (user_id, justificativa, promovido_por)
  values (p_user_id, p_justificativa, auth.uid())
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function admin_promover_para_admin(uuid, text) from public, anon;
grant execute on function admin_promover_para_admin(uuid, text) to authenticated, service_role;
