# FOOTBASE — Fase 4.3: Reivindicação de atleta

Data: 12 de agosto de 2026  
Status: implementado, aplicado e validado no Supabase ativo

## 1. Objetivo

Conectar o botão de reivindicação do dossiê `/atletas/[bid]` à tabela `solicitacoes_reivindicacao`, criando um fluxo auditável e seguro para agentes comprovarem a representação de atletas. A funcionalidade deve preservar o Matchday Premium, o contrato do scraper e as permissões da Fase 4.1.

## 2. Escopo

Incluído nesta fase:

- formulário de reivindicação no dossiê;
- comprovante HTTP(S) e justificativa obrigatórios;
- estados de disponibilidade, pendência, rejeição, aprovação e representação existente;
- leitura privada da própria solicitação;
- regras de banco para inserção, revisão e sincronização com `atletas`;
- reenvio depois de rejeição, mantendo o histórico;
- serviço Supabase, i18n PT/EN/ES e testes transacionais.

Fora desta fase:

- painel administrativo para aprovar/rejeitar, previsto para a Fase 5;
- transferência de atleta entre agentes;
- upload para Supabase Storage;
- alteração do design estrutural do dossiê;
- mudanças no scraper.

## 3. Regras de negócio

1. Somente uma conta com `profiles.role = agent`, `account_status = approved` e agente com `verified_status = verified` pode solicitar.
2. O atleta deve existir e estar `claim_status = unclaimed`, sem agente vinculado.
3. Cada atleta admite no máximo uma solicitação pendente.
4. O mesmo agente pode representar e solicitar vários atletas.
5. O pedido exige:
   - `documento_url` HTTP(S), com até 1.000 caracteres;
   - `mensagem` entre 20 e 2.000 caracteres.
6. Um pedido rejeitado permanece no histórico e não impede um novo envio.
7. Atleta já reivindicado não recebe novas solicitações.
8. Nenhum agente pode substituir outro agente diretamente.
9. Aprovação e rejeição são operações exclusivas de administrador.
10. A ingestão por scraping não modifica `agent_id`, `claim_status`, solicitações ou decisões administrativas.

## 4. Abordagem escolhida

Reutilizar `solicitacoes_reivindicacao`, distinguindo o alvo por `tipo = atleta`. Essa abordagem mantém clubes e atletas na mesma trilha de auditoria, reduz duplicação de RLS e prepara a futura central administrativa para revisar ambos os tipos.

Não será criada uma tabela paralela. As regras específicas de atleta serão isoladas em funções de banco, helpers e serviço próprios, sem acoplar a UI de clubes à UI de atletas.

## 5. Arquitetura e dados

### 5.1 Estado persistido

- `solicitacoes_reivindicacao` guarda solicitante, BID, comprovante, justificativa, status e revisão.
- `atletas.claim_status` reflete `unclaimed`, `pending` ou `claimed`.
- `atletas.agent_id` permanece nulo até aprovação.
- Ao aprovar, o banco resolve o registro `agentes.id` pertencente a `requested_by`, grava `agent_id` e define `claimed`.
- Ao rejeitar ou excluir administrativamente um pedido pendente, o atleta retorna a `unclaimed` com `agent_id` nulo.

### 5.2 Restrições e concorrência

- índice parcial exclusivo por `bid_atleta` quando `tipo = atleta` e `status = pending`;
- trigger `BEFORE INSERT` bloqueia solicitante inválido e trava o atleta com `FOR UPDATE`;
- o trigger normaliza `status = pending`, `reviewed_by = null` e `reviewed_at = null`;
- constraints validam documento e mensagem para ambos os tipos, sem quebrar registros históricos;
- aprovação falha se o atleta deixou de estar pendente ou se o agente deixou de ser elegível.

### 5.3 Privacidade e RLS

- solicitante lê somente seus pedidos;
- admin lê e revisa todos;
- outros agentes e clubes não leem comprovante, justificativa ou identidade do solicitante;
- insert exige autoria por `auth.uid()` e elegibilidade real consultada no banco;
- update/delete permanecem administrativos;
- funções privilegiadas têm `search_path` fixo e EXECUTE revogado de `public`, `anon` e `authenticated` quando forem apenas triggers.

## 6. Fluxo da interface

O dossiê carregará o estado real do atleta e, quando aplicável, a solicitação mais recente do usuário atual.

### 6.1 Estados

- `eligible`: mostra “Reivindicar atleta” e formulário.
- `own-pending`: mostra “Solicitação em análise” e link para o próprio comprovante.
- `other-pending`: informa que existe solicitação em análise, sem identificar o solicitante.
- `own-claimed`: mostra “Gerenciar atleta” e direciona a `/agente`.
- `other-claimed`: informa “Atleta já representado”.
- `rejected`: informa a rejeição e permite “Enviar nova solicitação”.
- `unverified-agent`: informa que a verificação do agente é necessária.
- `club-view`: exibição somente leitura.
- `admin-view`: exibe o estado; revisão será feita na Fase 5.

### 6.2 Comportamento

- o formulário abre dentro do dossiê, sem modal estrutural ou nova rota;
- o layout usa `matchday-surface`, `matchday-heading`, componentes existentes, cantos retos e os temas atuais;
- a interface só assume pendência depois de confirmação do Supabase;
- erros de validação são específicos; erros de banco/conexão usam mensagem genérica sem expor detalhes SQL;
- link do comprovante abre em nova aba com `noopener noreferrer`;
- controles mantêm foco visível, labels e alvos de toque adequados.

## 7. Transferência futura de representação

A Fase 4.3 não implementa transferência e bloqueia reivindicações contra atletas já representados. Entretanto, o vínculo não será tratado como historicamente apagável ou substituível por agentes.

Na Fase 5, uma operação administrativa dedicada deverá:

- exigir agente anterior, novo agente, justificativa e comprovante;
- registrar administrador e data;
- preservar solicitações e vínculos anteriores em histórico;
- executar a troca atomicamente;
- impedir atualização direta por agente, clube ou scraper.

A transferência não será simulada por exclusão do pedido anterior nem por update livre de `atletas.agent_id`.

## 8. Compatibilidade com scraping

- nenhuma chave institucional será renomeada ou removida;
- BID continua sendo a identidade estável do atleta;
- seeds e upserts do scraper preservam `agent_id` e `claim_status` existentes;
- `service_role` permanece somente server-side;
- futuras mudanças seguem expand/contract, teste de amostra e rollback conforme `CLAUDE.MD`.

## 9. Componentes e serviços previstos

- regras puras para validar campos e resolver estados da UI;
- serviço Supabase para carregar estado e criar reivindicação;
- componente cliente de reivindicação incorporado ao dossiê;
- adaptação do dossiê para dados reais necessários ao fluxo;
- migração de banco e espelho em `supabase/schema.sql`;
- teste SQL transacional em `supabase/tests/`;
- novas chaves i18n PT/EN/ES;
- script de testes unitários no `package.json`.

## 10. Testes e critérios de aceite

### Unitários

- URL aceita somente HTTP(S) e respeita limite;
- justificativa aceita 20–2.000 caracteres;
- estados de UI para agente, clube, admin, pendência, rejeição e posse;
- erro não confirmado não muda o estado local para pendente.

### Banco/RLS

- agente aprovado e verificado solicita atleta disponível;
- agente não verificado, clube ou outro papel falha;
- segundo pedido pendente para o atleta falha;
- pedidos para atletas diferentes pelo mesmo agente funcionam;
- outro usuário não lê a evidência;
- identidade/evidência/alvo são imutáveis;
- aprovação vincula o `agentes.id` correto;
- rejeição libera e permite reenvio;
- atleta já representado não aceita solicitação;
- dados sintéticos são removidos por rollback.

### Aplicação

- testes existentes permanecem verdes;
- TypeScript sem erros;
- build de produção aprovado;
- temas claro/escuro, responsividade e acessibilidade preservados;
- Security Advisor sem novos erros;
- migração e teste executados no projeto ativo somente após autorização já concedida pelo usuário.

## 11. Continuidade documental

Ao concluir, atualizar `PROJECT_STATE.MD`, `CLAUDE.MD` e `PLANO_EXECUCAO_V3.md` com migrações aplicadas, resultado dos testes, estado do Advisor e próxima etapa recomendada.
