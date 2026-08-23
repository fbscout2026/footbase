-- FOOTBASE — finish the Session 52 RLS perf fix (InitPlan wrapping) on the 4
-- `*_select_approved` policies that were left behind when the pattern was
-- applied to clubes/torneios/atletas/conquistas/historico_clubes. Purely a
-- performance rewrite: `(select private.is_approved())` evaluates the
-- function once per query instead of once per row scanned — same semantics,
-- same set of rows returned, found live during a Session 57 dashboard
-- perf investigation (categoria_ordem/confederacoes/paises/federacoes were
-- the only 4 tables still on the old unwrapped form).

drop policy if exists categoria_ordem_select_approved on categoria_ordem;
create policy categoria_ordem_select_approved on categoria_ordem
  for select using ((select private.is_approved()) or (select private.is_admin()));

drop policy if exists confederacoes_select_approved on confederacoes;
create policy confederacoes_select_approved on confederacoes
  for select using ((select private.is_approved()) or (select private.is_admin()));

drop policy if exists paises_select_approved on paises;
create policy paises_select_approved on paises
  for select using ((select private.is_approved()) or (select private.is_admin()));

drop policy if exists federacoes_select_approved on federacoes;
create policy federacoes_select_approved on federacoes
  for select using ((select private.is_approved()) or (select private.is_admin()));

-- end of migration
