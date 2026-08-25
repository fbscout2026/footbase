-- FOOTBASE — new source go-live: FES (Federação de Futebol do Estado do Espírito
-- Santo). Core-pattern requirement for every new source (per the scraper contract):
-- every adapter's tournaments link to a real `federacoes` row via `sigla` matching
-- the `federation` string the adapter passes to `parseCbfSumula` — without this row,
-- `ingest.ts`'s lookup (`federacoes.sigla = t.federation`) silently returns null and
-- every FES tournament would be created with no federation link at all (same
-- mechanism already covers CBF/FPF/FERJ/FMF/FGF, each seeded the same way when it
-- went live). Also backfills FGF into this same seed block — it went live via its
-- own earlier migration and was never added here, so `schema.sql`'s reference copy
-- was out of sync with production; harmless no-op there either way (`on conflict do
-- nothing`), just closing the drift while touching this exact block.

insert into federacoes (pais_id, nome, sigla, tipo)
select p.id, v.nome, v.sigla, v.tipo
from paises p
cross join (values
  ('Federação Gaúcha de Futebol', 'FGF', 'estadual'),
  ('Federação de Futebol do Estado do Espírito Santo', 'FES', 'estadual')
) as v(nome, sigla, tipo)
where p.nome = 'Brasil'
on conflict (pais_id, sigla) do nothing;

update torneios t set federacao_id = f.id
from federacoes f
where t.federacao_id is null and f.sigla = t.federation;

-- end of migration
