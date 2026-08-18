# Fase 4.2 — Diretório, perfil semente e posse de clubes

**Status:** design aprovado pelo usuário em 12/08/2026  
**Escopo:** UC08, rotas `/clubes` e `/clubes/[id]`  
**Baseline visual obrigatório:** Matchday Premium, full-width, temas claro/escuro e contrato de preservação de `CLAUDE.MD`

## 1. Objetivo

Disponibilizar um diretório pesquisável de clubes e um perfil institucional derivado dos dados oficiais, permitindo que uma conta aprovada com papel `club` solicite a posse de exatamente um clube. O fluxo deve funcionar no Supabase real, preservar a futura ingestão por scraper e impedir que contas cliente alterem dados institucionais diretamente.

## 2. Decisões aprovadas

- Implementar o diretório `/clubes` e o perfil `/clubes/[id]`.
- Habilitar “Clubes” na navegação interna.
- Cada conta `club` pode ter somente uma solicitação de clube pendente ou um clube já reivindicado.
- O pedido exige link de documento comprobatório e justificativa, ambos obrigatórios.
- Não haverá upload para Supabase Storage nesta fase; o comprovante será uma URL HTTP/HTTPS.
- O pedido permanece pendente até revisão administrativa.
- Nenhum dado institucional fica editável antes ou depois da aprovação nesta fase.
- Agentes consultam perfis, mas não solicitam posse de clube.
- A interface administrativa de aprovar/rejeitar pertence à Fase 5; as transições do banco já devem ficar seguras e consistentes.

## 3. Fora do escopo

- Painel de gestão ou edição institucional do clube.
- Aprovação/rejeição visual no `/admin`.
- Upload de arquivos para Storage.
- Convites para outros usuários do mesmo clube.
- Estatísticas avançadas do clube além dos dados já disponíveis.
- Alteração do design Matchday Premium.
- Implementação do fluxo de reivindicação de atleta da Fase 4.3.

## 4. Arquitetura

### 4.1 Rotas

#### `/clubes`

Diretório full-width conectado ao Supabase, com:

- busca por nome;
- filtros por estado, federação e estado da posse;
- tabela/listagem com escudo, nome, UF, federação, total de atletas e badge de posse;
- links para `/clubes/[id]`;
- estados de carregamento vazio e erro;
- nenhuma substituição silenciosa por mock.

#### `/clubes/[id]`

Perfil semente conectado ao Supabase, com:

- escudo, nome, estado, federação e badge de posse;
- categorias ativas;
- torneios disputados;
- total de atletas;
- elenco atual vindo de `atletas`, com links para `/atletas/[bid]`;
- painel contextual de posse e solicitação;
- resposta de não encontrado para UUID inexistente ou inacessível.

### 4.2 Unidades de código

- `lib/services/clubs.ts`: consultas e mutações Supabase, mapeadas para tipos da aplicação.
- `lib/club-claim-rules.ts`: normalização da URL, justificativa e resolução dos estados da interface.
- `components/clubes/ClubDirectory.tsx`: busca, filtros e listagem.
- `components/clubes/ClubProfileHeader.tsx`: identidade e resumo institucional.
- `components/clubes/ClubSquad.tsx`: elenco atual e navegação por BID.
- `components/clubes/ClubClaimPanel.tsx`: formulário, estados da posse e histórico próprio.
- Server Components das rotas carregam dados e entregam props; componentes cliente cuidam somente de interação e mutação.

Cada unidade deve ter uma finalidade única e não deve importar dados mock como fallback.

## 5. Dados

### 5.1 Fontes de leitura

- `view_clube_resumo`: identidade, posse, total de atletas, categorias e torneios.
- `clubes`: lista e identidade canônica quando necessário.
- `atletas`: elenco por `current_club_id`.
- `solicitacoes_reivindicacao`: solicitação própria e estado de revisão.

`view_clube_resumo` permanece `security_invoker = true`.

### 5.2 Reivindicação

O payload de criação contém somente:

- `tipo = 'clube'`;
- `clube_id`;
- `requested_by = auth.uid()`;
- `documento_url` obrigatório;
- `mensagem` obrigatória;
- `status = 'pending'` definido pelo banco.

O cliente não define `reviewed_by`, `reviewed_at`, `reivindicado_por` nem `claim_status`.

### 5.3 Restrições de unicidade

O banco deve garantir:

- no máximo uma solicitação de clube `pending` por `requested_by`;
- no máximo uma solicitação `pending` por `clube_id`;
- no máximo um clube com `reivindicado_por` igual à mesma conta;
- inexistência de pedido para clube já `pending` ou `claimed`.

Índices parciais devem cobrir as três primeiras invariantes. A política e o trigger cobrem a última.

## 6. Fluxo e transições de estado

### 6.1 Criação

1. O usuário aprovado com `profiles.role = 'club'` abre um clube `unclaimed`.
2. A interface verifica se ele não possui pedido pendente ou clube reivindicado.
3. O usuário envia URL de documento e justificativa válidas.
4. O `INSERT` passa pela RLS.
5. Um trigger transacional marca o clube como `pending`.
6. A interface substitui o formulário pelo estado “Em análise” somente após confirmação do Supabase.

### 6.2 Aprovação futura

Quando um administrador mudar a solicitação de `pending` para `approved`, o trigger:

- define `clubes.reivindicado_por = requested_by`;
- define `clubes.claim_status = 'claimed'`;
- mantém as restrições de uma conta por clube e um clube por conta.

### 6.3 Rejeição futura

Quando um administrador mudar a solicitação de `pending` para `rejected`, o trigger:

- remove `reivindicado_por` se aplicável;
- retorna `clubes.claim_status` para `unclaimed`;
- libera o clube e a conta para nova solicitação.

Uma exclusão administrativa de pedido pendente também deve liberar o clube de forma consistente.

## 7. Segurança e RLS

### 7.1 Leitura

- Clubes e a view resumida continuam legíveis somente por contas aprovadas e administradores.
- Solicitações são legíveis somente pelo solicitante ou administrador.
- Documento, justificativa e identidade do solicitante nunca são expostos a outra conta.

### 7.2 Inserção

A política de `solicitacoes_reivindicacao` deve distinguir os dois tipos:

- `tipo = 'clube'`: exige conta aprovada com papel `club`, alvo `unclaimed`, ausência de outro pedido pendente e ausência de clube já reivindicado pela conta;
- `tipo = 'atleta'`: exige conta aprovada com papel `agent`, `bid_atleta` preenchido e `clube_id` nulo; a interface e regras adicionais do atleta permanecem para a Fase 4.3.

Para pedidos de clube, a política exige `requested_by = auth.uid()`, `status = 'pending'`, `reviewed_by is null` e `reviewed_at is null`. Constraints validam URL e justificativa. O banco não confia no payload cliente para autoria ou estado.

### 7.3 Atualização e exclusão

- Apenas administrador atualiza ou exclui solicitações.
- Apenas administrador altera manualmente `clubes` via API autenticada.
- O scraper continua usando `service_role` e não depende das permissões de contas cliente.
- Funções `SECURITY DEFINER` usadas por triggers devem fixar `search_path`, ter `EXECUTE` revogado de `public`, `anon` e `authenticated` e não ficar disponíveis como RPC cliente.

### 7.4 Proteções contra concorrência

Índices únicos e trigger executam na mesma transação do pedido. Dois pedidos simultâneos para a mesma conta ou clube não podem ser aceitos.

## 8. Estados da interface

### 8.1 Diretório

Badges:

- `unclaimed`: Disponível;
- `pending`: Em análise;
- `claimed`: Reivindicado.

Os filtros usam esses valores internos, traduzidos pela camada i18n.

### 8.2 Perfil

- `unclaimed` + conta Clube elegível: formulário ativo.
- `unclaimed` + agente: informação de que somente clubes podem reivindicar.
- solicitação própria `pending`: mostra “Em análise”, URL, justificativa e data.
- pedido de outra conta `pending`: mostra apenas “Posse em análise”.
- `claimed` pela conta atual: mostra “Clube sob sua representação”, sem edição institucional.
- `claimed` por outra conta: mostra “Posse já reivindicada”.
- administrador: mostra contexto institucional; a ação de revisão fica fora do escopo.

## 9. Validação de entrada e erros

- `documento_url`: obrigatório, protocolo HTTP ou HTTPS, máximo de 1000 caracteres.
- `mensagem`: obrigatória após `trim`, entre 20 e 2000 caracteres.
- O botão de envio fica bloqueado durante a mutação.
- Erros do Supabase aparecem de forma clara, sem apagar valores digitados.
- Violações de unicidade são convertidas em mensagem de pedido já existente.
- A interface só confirma sucesso após receber a linha criada.
- Falhas de carregamento têm estado de erro e ação para tentar novamente.

## 10. Design e acessibilidade

- Preservar cabeçalhos grafite, logos oficiais, paleta e temas claro/escuro.
- Diretório e perfil são full-width com paddings responsivos.
- Cards informativos permanecem retos e usam tokens existentes.
- Reutilizar `matchday-surface`, `matchday-heading`, `Button`, `Input`, `Badge`, `Select` e padrões de tabela existentes.
- Não adicionar gradientes ao cabeçalho, novas cores de marca ou containers externos com faixas laterais.
- Controles têm nomes acessíveis, foco visível, alvos de pelo menos 44 px e operação por teclado.
- Textos completos em PT, EN e ES.

## 11. Testes e critérios de conclusão

### 11.1 Unidade

- normalização e validação de URL e justificativa;
- resolução dos estados de posse;
- filtros do diretório;
- mapeamento das mensagens de duplicidade.

### 11.2 Integração SQL transacional

Com usuários sintéticos e rollback obrigatório:

- conta Clube aprovada cria pedido válido;
- agente não cria pedido de clube;
- conta Clube não cria pedido de atleta;
- conta não cria segundo pedido pendente;
- outro clube não solicita alvo pendente;
- aprovação vincula conta e clube;
- rejeição libera ambos;
- outra conta não lê documento ou justificativa;
- dados institucionais não são alteráveis pelo solicitante;
- concorrência é protegida por índices;
- nenhum dado sintético permanece após rollback.

### 11.3 Aplicação e banco live

- TypeScript sem erros;
- build de produção aprovado;
- testes do painel do agente, comparação e prancheta continuam passando;
- migração aplicada e verificada no projeto `tqehidwpqwkcbxyducmz`;
- consulta de catálogo confirma índices, triggers e políticas;
- Security Advisor permanece com zero erros novos;
- teste manual responsivo e nos dois temas;
- documentos `PROJECT_STATE.MD`, `CLAUDE.MD` e `PLANO_EXECUCAO_V3.md` atualizados.

## 12. Continuidade com o scraper

O scraper poderá criar e atualizar clubes semente pelo `source_key` usando `service_role`. Nenhum `INSERT` do scraper cria posse, solicitação ou usuário. Os relacionamentos com atletas e partidas alimentam automaticamente elenco, categorias e torneios mostrados pelo perfil, sem exigir mudanças na interface.
