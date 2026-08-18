-- ============================================================================
-- FOOTBASE — Fase 6.4: atletas.birth_date passa a ser OPCIONAL (nullable) + backfill
-- ----------------------------------------------------------------------------
-- Nem a súmula nem a lista da API de registro CBF trazem data de nascimento, e o
-- endpoint de detalhe (que a tem) está indisponível. Para o perfil único acumular
-- dados assim que o atleta aparece em QUALQUER fonte, o atleta é semeado já com
-- BID+nome+clube e a data de nascimento é preenchida depois (backfill) quando uma
-- fonte a fornecer. Sem isso, o NOT NULL bloquearia toda a ingestão de atletas.
--
-- Impacto (análise): `view_atleta_resumo` tolera null — `date_part('year',
-- age(birth_date))` e `ano_nascimento` ficam NULL, sem erro. A UI hoje lê o mock
-- (todos com data), então nada quebra; ao ligar a leitura do banco, tratar idade/
-- nascimento nulos no dossiê e nos filtros. Linhas existentes mantêm seus valores.
-- ADITIVA/segura (relaxa constraint). Rollback exige que não haja linhas com null.
-- ============================================================================

alter table atletas alter column birth_date drop not null;
