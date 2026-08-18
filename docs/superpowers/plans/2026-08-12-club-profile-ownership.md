# Plano de implementação — Fase 4.2 Clubes e posse

**Especificação:** `docs/superpowers/specs/2026-08-12-club-profile-ownership-design.md`

## 1. Regras e testes isolados

- Criar `lib/club-claim-rules.ts` com validação do documento, justificativa, estados de posse e filtros.
- Criar testes unitários para URL, limites, estados e filtros.
- Adicionar comando `test:clubs` ao `package.json`.

## 2. Migração e schema

- Criar migração com constraints de documento/mensagem, índices únicos parciais e unicidade de `reivindicado_por`.
- Substituir a política de insert por regras separadas para clube e atleta.
- Criar triggers transacionais de criação, aprovação, rejeição e exclusão de pedido de clube.
- Revogar execução direta das funções de trigger.
- Espelhar o estado final em `supabase/schema.sql`.
- Criar teste SQL transacional com usuários sintéticos, concorrência lógica, isolamento e rollback.

## 3. Serviço de dados

- Criar `lib/services/clubs.ts` para diretório, perfil, elenco, pedido próprio e criação da reivindicação.
- Mapear linhas Supabase para tipos internos e tratar ausência/duplicidade explicitamente.

## 4. Interface

- Implementar `/clubes` e `ClubDirectory` com busca/filtros e tabela acessível.
- Implementar `/clubes/[id]`, cabeçalho/resumo, elenco e painel de posse.
- Habilitar “Clubes” no `AppNav`.
- Preservar Matchday Premium, full-width, temas, cantos retos e alvos de toque.

## 5. Internacionalização

- Adicionar todas as chaves PT/EN/ES para diretório, perfil, elenco, formulário, estados e erros.
- Verificar paridade dos três dicionários.

## 6. Validação local e revisão

- Rodar testes de clubes e regressões existentes.
- Rodar TypeScript e build de produção.
- Revisar segurança, acessibilidade, responsividade e ausência de fallback mock.

## 7. Supabase live

- Aplicar a migração no projeto `tqehidwpqwkcbxyducmz` já autorizado.
- Confirmar catálogo, executar teste SQL e verificar rollback sem resíduos.
- Conferir Security Advisor e corrigir qualquer erro novo.

## 8. Continuidade

- Atualizar `PROJECT_STATE.MD`, `CLAUDE.MD` e `PLANO_EXECUCAO_V3.md`.
- Registrar a Fase 4.2 como concluída e indicar a Fase 4.3 como próximo passo.
