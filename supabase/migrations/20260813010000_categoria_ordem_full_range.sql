-- ============================================================================
-- FOOTBASE — Fase 6.4: categoria_ordem cobre toda a faixa SUB-11..SUB-20
-- ----------------------------------------------------------------------------
-- CBF nacional usa as ímpares + SUB-20, mas federações estaduais (FPF, FERJ, …)
-- também têm as pares (SUB-12/14/16/18) e SUB-19. A ingestão referencia
-- `categoria_ordem` por FK (atletas.current_category, partidas_sumula.match_category,
-- atuacoes_sumula.player_category), então TODA categoria possível precisa existir —
-- senão o upsert quebra (foi o caso de SUB-18).
--
-- Re-ranqueia por IDADE (intercala as pares) preservando toda ordem relativa já
-- existente — as comparações de "categoria acima" continuam corretas, só ficam mais
-- granulares. ADITIVA/idempotente; evita colisão no unique(rank) com um offset
-- temporário. Rollback: reverter ranks e remover as categorias adicionadas.
-- ============================================================================

-- 1) Tira as linhas existentes da faixa de destino (evita colisão no unique(rank)).
update categoria_ordem set rank = rank + 100 where rank < 100;

-- 2) Define a faixa completa, ranqueada por idade (upsert idempotente).
insert into categoria_ordem (categoria, rank) values
  ('SUB-11', 1), ('SUB-12', 2), ('SUB-13', 3), ('SUB-14', 4), ('SUB-15', 5),
  ('SUB-16', 6), ('SUB-17', 7), ('SUB-18', 8), ('SUB-19', 9), ('SUB-20', 10)
on conflict (categoria) do update set rank = excluded.rank;

-- 3) Segurança: nada deve sobrar no offset temporário.
delete from categoria_ordem where rank > 100;
