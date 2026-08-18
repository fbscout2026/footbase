-- ============================================================================
-- FOOTBASE — Migration 003: v3.0 Caso de Uso (CONSOLIDATED)
-- ============================================================================
-- Run this ONCE in the Supabase SQL editor. It is self-contained and
-- idempotent: it converges the live database to the full v3.0 Use-Case schema
-- whether it is currently at the Session-4 state OR the Phase-1 (migration 002)
-- state. Because the match tables are empty, atuacoes_sumula is dropped and
-- rebuilt. **This migration SUPERSEDES 002_phase1_v3.sql** — if you have not run
-- 002 yet, do not; just run this. If you already ran 002, this is still safe.
--
-- If atuacoes_sumula already holds real data, back it up first — step 12 drops it.
-- ============================================================================

begin;

-- 0. Hardening scaffolding (idempotent).
create schema if not exists extensions;
create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "pg_trgm" with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

-- 1. Drop views that depend on columns/tables we are about to change.
drop view if exists view_atleta_resumo;
drop view if exists view_clube_resumo;

-- 2. profiles: new columns.
alter table profiles add column if not exists full_name text;
alter table profiles add column if not exists whatsapp text;
alter table profiles add column if not exists organization text;

-- 3. clubes: seed-profile ownership + federation.
alter table clubes add column if not exists federacao text;
alter table clubes add column if not exists reivindicado_por uuid references auth.users (id) on delete set null;
alter table clubes add column if not exists claim_status text not null default 'unclaimed';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'clubes_claim_status_check') then
    alter table clubes add constraint clubes_claim_status_check
      check (claim_status in ('unclaimed', 'pending', 'claimed'));
  end if;
end $$;
create index if not exists idx_clubes_claim on clubes (claim_status);

-- 4. agentes: license, markets, contacts.
alter table agentes add column if not exists license_level text;
alter table agentes add column if not exists markets text[] not null default '{}';
alter table agentes add column if not exists instagram text;
alter table agentes add column if not exists phone text;
alter table agentes add column if not exists contact_email text;

-- 5. atletas: biographic / positional / sporting columns + youtube rename.
alter table atletas add column if not exists apelido text;
alter table atletas add column if not exists nacionalidade text not null default 'Brasileiro';
alter table atletas add column if not exists tem_passaporte boolean not null default false;
alter table atletas add column if not exists passaporte text;
alter table atletas add column if not exists posicao_secundaria text;
alter table atletas add column if not exists inicio_carreira smallint;
alter table atletas add column if not exists experiencia_internacional boolean not null default false;
alter table atletas add column if not exists jogos_suspenso smallint not null default 0;

do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'atletas'
      and column_name = 'youtube_highlights_url'
  ) then
    alter table atletas rename column youtube_highlights_url to youtube_video_url;
  end if;
end $$;
alter table atletas add column if not exists youtube_video_url text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'atletas_posicao_secundaria_check') then
    alter table atletas add constraint atletas_posicao_secundaria_check
      check (posicao_secundaria in ('GK','CB','LB','RB','DM','CM','AM','LW','RW','ST'));
  end if;
end $$;

create index if not exists idx_atletas_birth_date on atletas (birth_date);
create index if not exists idx_atletas_nacionalidade on atletas (nacionalidade);
create index if not exists idx_atletas_position on atletas (main_position);

-- 6. shared helpers.
create or replace function set_updated_at()
returns trigger language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 7. athlete update guard (adds every new field to the admin-only set).
create or replace function guard_atleta_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if private.is_admin() then
    return new;
  end if;

  if exists (
    select 1 from agentes a
    where a.id = old.agent_id
      and a.user_id = auth.uid()
      and a.verified_status = 'verified'
      and old.claim_status = 'claimed'
  ) then
    if new.bid is distinct from old.bid
      or new.fifa_id is distinct from old.fifa_id
      or new.name is distinct from old.name
      or new.apelido is distinct from old.apelido
      or new.birth_date is distinct from old.birth_date
      or new.nacionalidade is distinct from old.nacionalidade
      or new.tem_passaporte is distinct from old.tem_passaporte
      or new.passaporte is distinct from old.passaporte
      or new.main_position is distinct from old.main_position
      or new.posicao_secundaria is distinct from old.posicao_secundaria
      or new.inicio_carreira is distinct from old.inicio_carreira
      or new.contract_end_date is distinct from old.contract_end_date
      or new.current_club_id is distinct from old.current_club_id
      or new.current_category is distinct from old.current_category
      or new.experiencia_internacional is distinct from old.experiencia_internacional
      or new.jogos_suspenso is distinct from old.jogos_suspenso
      or new.agent_id is distinct from old.agent_id
      or new.claim_status is distinct from old.claim_status
    then
      raise exception 'agents may only edit dominant_foot, height_cm, weight_kg, youtube_video_url';
    end if;
    return new;
  end if;

  raise exception 'not authorized to update this athlete';
end;
$$;
revoke execute on function guard_atleta_update() from public, anon, authenticated;

-- 8. signup provisioning (populates the new profiles columns).
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  signup_role text := coalesce(meta->>'role', 'agent');
begin
  insert into profiles (id, role, full_name, whatsapp, organization)
  values (new.id, signup_role, meta->>'full_name', meta->>'whatsapp', meta->>'organization');

  if signup_role = 'agent' then
    insert into agentes (user_id, full_name, agency_name)
    values (new.id, coalesce(meta->>'full_name', ''), coalesce(meta->>'agency_name', meta->>'organization'));
  end if;

  return new;
end;
$$;
revoke execute on function handle_new_user() from public, anon, authenticated;
drop trigger if exists trg_handle_new_user on auth.users;
create trigger trg_handle_new_user
  after insert on auth.users
  for each row execute function handle_new_user();

-- 9. torneios (ensure it exists on Session-4 databases; it already does).
create table if not exists torneios (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  federation text not null,
  category text references categoria_ordem (categoria),
  year smallint not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_torneios_federation on torneios (federation);
create index if not exists idx_torneios_category_year on torneios (category, year);

-- 10. conquistas.
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

-- 11. scraping_logs.
create table if not exists scraping_logs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
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

-- 12. match model (drop empty atuacoes; ensure partidas; rebuild atuacoes).
drop table if exists atuacoes_sumula cascade;

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
  clean_sheet boolean not null default false,
  created_at timestamptz not null default now(),
  unique (partida_id, bid_atleta)
);
create index if not exists idx_atuacoes_bid on atuacoes_sumula (bid_atleta);
create index if not exists idx_atuacoes_partida on atuacoes_sumula (partida_id);

-- 13. favoritos.
create table if not exists favoritos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  bid_atleta bigint not null references atletas (bid) on delete cascade,
  nota smallint check (nota between 0 and 100),
  notas text,
  created_at timestamptz not null default now(),
  unique (user_id, bid_atleta)
);
create index if not exists idx_favoritos_user on favoritos (user_id);
create index if not exists idx_favoritos_bid on favoritos (bid_atleta);

-- 14. prancheta_tatica + slots.
create table if not exists prancheta_tatica (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default 'Minha Prancheta',
  formation text not null default '4-3-3',
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
  position_code text,
  slot_order smallint not null default 0,
  created_at timestamptz not null default now(),
  unique (prancheta_id, bid_atleta),
  unique (prancheta_id, slot_type, slot_order)
);
create index if not exists idx_prancheta_slots_board on prancheta_slots (prancheta_id);

-- 15. solicitacoes_reivindicacao (athlete + club claims).
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

-- 16. solicitacoes_correcao (+ comprovante_url).
create table if not exists solicitacoes_correcao (
  id uuid primary key default gen_random_uuid(),
  bid_atleta bigint not null references atletas (bid) on delete cascade,
  requested_by uuid not null references auth.users (id) on delete cascade,
  field_name text not null,
  current_value text,
  suggested_value text not null,
  reason text,
  comprovante_url text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table solicitacoes_correcao add column if not exists comprovante_url text;
create index if not exists idx_solicitacoes_bid on solicitacoes_correcao (bid_atleta);
create index if not exists idx_solicitacoes_requester on solicitacoes_correcao (requested_by);
create index if not exists idx_solicitacoes_status on solicitacoes_correcao (status);

-- 17. RLS + policies for every new / rebuilt table (existing tables keep theirs).
alter table conquistas enable row level security;
alter table scraping_logs enable row level security;
alter table partidas_sumula enable row level security;
alter table atuacoes_sumula enable row level security;
alter table favoritos enable row level security;
alter table prancheta_tatica enable row level security;
alter table prancheta_slots enable row level security;
alter table solicitacoes_reivindicacao enable row level security;
alter table solicitacoes_correcao enable row level security;

drop policy if exists conquistas_select_approved on conquistas;
drop policy if exists conquistas_write_admin on conquistas;
create policy conquistas_select_approved on conquistas
  for select using (private.is_approved() or private.is_admin());
create policy conquistas_write_admin on conquistas
  for all using (private.is_admin()) with check (private.is_admin());

drop policy if exists scraping_logs_select_admin on scraping_logs;
drop policy if exists scraping_logs_write_admin on scraping_logs;
create policy scraping_logs_select_admin on scraping_logs
  for select using (private.is_admin());
create policy scraping_logs_write_admin on scraping_logs
  for all using (private.is_admin()) with check (private.is_admin());

drop policy if exists partidas_select_approved on partidas_sumula;
drop policy if exists partidas_write_admin on partidas_sumula;
create policy partidas_select_approved on partidas_sumula
  for select using (private.is_approved() or private.is_admin());
create policy partidas_write_admin on partidas_sumula
  for all using (private.is_admin()) with check (private.is_admin());

drop policy if exists atuacoes_select_approved on atuacoes_sumula;
drop policy if exists atuacoes_write_admin on atuacoes_sumula;
create policy atuacoes_select_approved on atuacoes_sumula
  for select using (private.is_approved() or private.is_admin());
create policy atuacoes_write_admin on atuacoes_sumula
  for all using (private.is_admin()) with check (private.is_admin());

drop policy if exists favoritos_owner_all on favoritos;
create policy favoritos_owner_all on favoritos
  for all
  using (user_id = auth.uid() or private.is_admin())
  with check (user_id = auth.uid() or private.is_admin());

drop policy if exists prancheta_owner_all on prancheta_tatica;
create policy prancheta_owner_all on prancheta_tatica
  for all
  using (user_id = auth.uid() or private.is_admin())
  with check (user_id = auth.uid() or private.is_admin());

drop policy if exists prancheta_slots_owner_all on prancheta_slots;
create policy prancheta_slots_owner_all on prancheta_slots
  for all
  using (
    private.is_admin()
    or exists (select 1 from prancheta_tatica pt where pt.id = prancheta_slots.prancheta_id and pt.user_id = auth.uid())
  )
  with check (
    private.is_admin()
    or exists (select 1 from prancheta_tatica pt where pt.id = prancheta_slots.prancheta_id and pt.user_id = auth.uid())
  );

drop policy if exists reivindicacao_select_own_or_admin on solicitacoes_reivindicacao;
drop policy if exists reivindicacao_insert_own on solicitacoes_reivindicacao;
drop policy if exists reivindicacao_update_admin on solicitacoes_reivindicacao;
drop policy if exists reivindicacao_delete_admin on solicitacoes_reivindicacao;
create policy reivindicacao_select_own_or_admin on solicitacoes_reivindicacao
  for select using (requested_by = auth.uid() or private.is_admin());
create policy reivindicacao_insert_own on solicitacoes_reivindicacao
  for insert with check (requested_by = auth.uid() and (private.is_approved() or private.is_admin()));
create policy reivindicacao_update_admin on solicitacoes_reivindicacao
  for update using (private.is_admin()) with check (private.is_admin());
create policy reivindicacao_delete_admin on solicitacoes_reivindicacao
  for delete using (private.is_admin());

drop policy if exists solicitacoes_select_own_or_admin on solicitacoes_correcao;
drop policy if exists solicitacoes_insert_own on solicitacoes_correcao;
drop policy if exists solicitacoes_update_admin on solicitacoes_correcao;
drop policy if exists solicitacoes_delete_admin on solicitacoes_correcao;
create policy solicitacoes_select_own_or_admin on solicitacoes_correcao
  for select using (requested_by = auth.uid() or private.is_admin());
create policy solicitacoes_insert_own on solicitacoes_correcao
  for insert with check (requested_by = auth.uid() and (private.is_approved() or private.is_admin()));
create policy solicitacoes_update_admin on solicitacoes_correcao
  for update using (private.is_admin()) with check (private.is_admin());
create policy solicitacoes_delete_admin on solicitacoes_correcao
  for delete using (private.is_admin());

-- 18. Rebuild views.
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

commit;
