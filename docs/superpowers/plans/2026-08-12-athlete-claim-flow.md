# Fase 4.3 — Plano de implementação da reivindicação de atleta

Status: concluído em 12 de agosto de 2026; migração aplicada e validações aprovadas.

## Objetivo

Ligar o dossiê à reivindicação real de atletas, com comprovante obrigatório, RLS, sincronização atômica e reenvio após rejeição.

## Etapas

1. Criar regras puras e testes para validação e estados da interface.
2. Criar migração compatível: constraints, índice parcial, triggers e política de insert.
3. Espelhar o estado final em `supabase/schema.sql`.
4. Criar teste SQL transacional para papéis, privacidade, concorrência, aprovação, rejeição e rollback.
5. Criar serviço Supabase para carregar elegibilidade/solicitação e inserir pedido.
6. Incorporar painel de reivindicação no dossiê sem alterar sua organização.
7. Adicionar i18n PT/EN/ES e script de teste.
8. Executar testes existentes e novos, TypeScript e build.
9. Aplicar no Supabase ativo, rodar teste transacional, verificar resíduos e Security Advisor.
10. Revisar segurança/regressões e atualizar `PROJECT_STATE.MD`, `CLAUDE.MD` e `PLANO_EXECUCAO_V3.md`.

## Gate de aceite

- somente agente aprovado e verificado solicita;
- um pedido pendente por atleta;
- rejeição permite reenvio;
- aprovação vincula o agente correto;
- outro usuário não lê evidência;
- atleta representado bloqueia novos pedidos;
- scraper preserva posse;
- zero resíduos dos testes;
- build e Advisor aprovados.
