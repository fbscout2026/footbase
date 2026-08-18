-- ============================================================================
-- FOOTBASE — Fase 6.4: fila de ingestão (retry) + identidade multi-fonte
-- ----------------------------------------------------------------------------
-- ADITIVA / EXPAND-ONLY / IDEMPOTENTE. Não altera nem remove nenhuma estrutura
-- existente; cria duas tabelas novas (vazias). Criar estas tabelas NÃO habilita
-- escrita live do scraper (isso segue bloqueado até a Fase 6.5) — são apenas a
-- infraestrutura de resiliência e de resolução de identidade.
--
-- Impacto no contrato de scraping: nenhum consumidor atual é afetado (tabelas
-- novas). service_role continua sendo o único produtor no backend; leitura é
-- admin-only (monitor /admin). Rollback: `drop table if exists` das duas tabelas.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- scraping_jobs — fila de retry por item (idempotente, incremental)
--   Cada item a processar (uma súmula, uma página de registro, um perfil) vira
--   uma linha. O run pula itens com erro e retenta no próximo (attempts++),
--   sinalizando os persistentes no monitor de ingestão do /admin. Idempotente:
--   o mesmo item nunca duplica graças ao unique (source, job_type, ref).
-- ----------------------------------------------------------------------------
create table if not exists scraping_jobs (
  id uuid primary key default gen_random_uuid(),
  source text not null,                         -- 'CBF', 'FPF', 'FERJ', ...
  job_type text not null,                        -- 'sumula' | 'registry' | 'profile'
  ref text not null,                             -- identificador estável do item (código/edicaoId/bid)
  status text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  attempts integer not null default 0,
  last_error text,
  payload jsonb,                                 -- contexto opcional do job (ano, categoria, url…)
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
-- atleta_fontes — mapa de identidade multi-fonte (perfil único por BID)
--   Cada atleta é UMA linha em `atletas` (chave `bid` = ID CBF de 6 dígitos) e
--   acumula atuações de qualquer categoria/torneio/estadual/nacional. Quando
--   uma fonte usa um id próprio (não-CBF), esta tabela liga (fonte, id_externo)
--   ao `bid` canônico, para unir sem duplicar. A união ancora no BID; casos sem
--   BID resolvidos por nome+nascimento entram como 'matched'/'manual' e passam
--   por revisão admin — nunca auto-merge fraco.
-- ----------------------------------------------------------------------------
create table if not exists atleta_fontes (
  bid bigint not null references atletas (bid) on delete cascade,
  fonte text not null,                           -- 'cbf', 'fpf', 'ferj', ...
  id_externo text not null,                      -- id do atleta naquela fonte
  confidence text not null default 'exact' check (confidence in ('exact', 'matched', 'manual')),
  resolved_by uuid references profiles (id) on delete set null, -- admin que confirmou um match não-exato
  created_at timestamptz not null default now(),
  primary key (fonte, id_externo)                -- um id externo → exatamente um bid
);

create index if not exists idx_atleta_fontes_bid on atleta_fontes (bid);

-- ----------------------------------------------------------------------------
-- RLS: leitura admin-only (monitor); escrita via service_role (ingestão) ou admin.
--   service_role ignora RLS por padrão; as policies liberam o admin.
-- ----------------------------------------------------------------------------
alter table scraping_jobs enable row level security;
alter table atleta_fontes enable row level security;

create policy scraping_jobs_select_admin on scraping_jobs
  for select using (private.is_admin());
create policy scraping_jobs_write_admin on scraping_jobs
  for all using (private.is_admin()) with check (private.is_admin());

create policy atleta_fontes_select_admin on atleta_fontes
  for select using (private.is_admin());
create policy atleta_fontes_write_admin on atleta_fontes
  for all using (private.is_admin()) with check (private.is_admin());
