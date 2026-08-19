-- FOOTBASE Session 52 — RLS performance fix (already applied live via `alter policy`,
-- this migration documents/reproduces it for a fresh environment).
--
-- Wraps `private.is_approved()`/`private.is_admin()` in `(select ...)` on the SELECT
-- policies of every table `view_atleta_resumo` touches. Same security semantics, just
-- lets Postgres evaluate the check once per query (InitPlan) instead of once per row.
-- Confirmed live: an unwrapped paginated query on `view_atleta_resumo` (which LATERAL-
-- joins atletas/clubes/atuacoes_sumula/partidas_sumula) hit a Postgres `statement
-- timeout` past a few thousand rows — even at a 50-row page, because ORDER BY on a
-- column computed by the view's own per-row correlated subquery can't be pushed down
-- through the LATERAL join under RLS, forcing evaluation (and per-row RLS re-checks)
-- of the WHOLE table before sorting. Wrapped, the same query returns in ~2s.

alter policy clubes_select_approved on clubes
  using ((select private.is_approved()) or (select private.is_admin()));

alter policy torneios_select_approved on torneios
  using ((select private.is_approved()) or (select private.is_admin()));

alter policy atletas_select_approved on atletas
  using ((select private.is_approved()) or (select private.is_admin()));

alter policy conquistas_select_approved on conquistas
  using ((select private.is_approved()) or (select private.is_admin()));

alter policy historico_select_approved on historico_clubes
  using ((select private.is_approved()) or (select private.is_admin()));

alter policy partidas_select_approved on partidas_sumula
  using ((select private.is_approved()) or (select private.is_admin()));

alter policy atuacoes_select_approved on atuacoes_sumula
  using ((select private.is_approved()) or (select private.is_admin()));
