-- ============================================================================
-- FOOTBASE — Aba Torneios: hierarquia Continente/Confederação → País → Federação
-- ----------------------------------------------------------------------------
-- ADITIVA / EXPAND-ONLY. `torneios.federation` (texto livre, consumido pelo
-- scraper) é preservado; `federacao_id` é uma coluna NOVA e NULLABLE que só
-- enriquece a navegação da UI. Nenhum consumidor existente é afetado.
--
-- Escopo: só o necessário para a aba Torneios funcionar hoje (produto é
-- Brasil-only) — as 6 confederações são estáticas e sempre as mesmas; países e
-- federações são semeados sob demanda (hoje: Brasil + CBF/FPF/FERJ/FMF), sem
-- inventar dados de outros países. Curadoria futura (admin) adiciona mais.
-- ============================================================================

create table if not exists confederacoes (
  id uuid primary key default gen_random_uuid(),
  continente text not null unique,   -- 'América do Sul', 'América do Norte, Central e Caribe', ...
  codigo text not null unique,       -- 'CONMEBOL', 'CONCACAF', 'AFC', 'CAF', 'UEFA', 'OFC'
  nome text not null
);

create table if not exists paises (
  id uuid primary key default gen_random_uuid(),
  confederacao_id uuid not null references confederacoes (id) on delete restrict,
  nome text not null,
  codigo text,                        -- ISO opcional
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

-- torneios: nova FK opcional; a coluna `federation` (texto) permanece intacta.
alter table torneios add column if not exists federacao_id uuid references federacoes (id) on delete set null;
create index if not exists idx_torneios_federacao_id on torneios (federacao_id);

-- --- Seed (idempotente) -----------------------------------------------------
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

-- Backfill: liga torneios existentes à federação pelo texto livre já gravado.
update torneios t set federacao_id = f.id
from federacoes f
where t.federacao_id is null and f.sigla = t.federation;

-- --- RLS: leitura para aprovados/admin; escrita admin-only (mesmo padrão de
-- categoria_ordem/torneios) -------------------------------------------------
alter table confederacoes enable row level security;
alter table paises enable row level security;
alter table federacoes enable row level security;

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
