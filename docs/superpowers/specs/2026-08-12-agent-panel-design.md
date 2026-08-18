# FOOTBASE — Fase 4.1: Painel do Agente

## 1. Objetivo

Entregar a rota autenticada `/agente` para que agentes aprovados administrem seu perfil profissional, acompanhem os atletas que representam, atualizem somente os campos autorizados desses atletas e enviem sugestões rastreáveis para correção de dados institucionais.

O painel deve reutilizar integralmente o design Matchday Premium aprovado. Esta fase não redesenha a aplicação, não muda a organização das telas existentes e não implementa a aprovação administrativa das solicitações, prevista para a Fase 5.

## 2. Acesso por papel

| Papel | Comportamento em `/agente` |
|---|---|
| `agent`, conta aprovada | Acessa o próprio painel e edita somente os dados permitidos. |
| `club` | É redirecionado para `/dashboard`. |
| `admin` | Acessa modo de supervisão: lista agentes e abre o painel selecionado em modo somente leitura. Não assume a identidade do agente. |
| Conta pendente ou rejeitada | Continua bloqueada pelo guarda global existente. |
| Sem sessão | Continua sendo redirecionada para `/login`. |

A autorização usa o papel armazenado em `profiles`, o vínculo `agentes.user_id` e `auth.uid()`. Metadados editáveis do Auth nunca participam das decisões de acesso.

## 3. Organização da tela

A rota mantém o paradigma full-width do sistema interno e a seguinte ordem:

1. Cabeçalho do painel com nome, agência, licença, situação da verificação e mercados de atuação.
2. Indicadores de atletas reivindicados, favoritos e solicitações pendentes.
3. Perfil profissional e contatos do agente.
4. Lista dos atletas representados, com acesso ao dossiê e ação de edição.
5. Área de sugestões de correção, contendo novo pedido e histórico.

No modo administrativo, o painel começa com a lista de agentes. A seleção de um agente carrega as mesmas seções, mas sem controles de gravação.

## 4. Perfil do agente

### 4.1 Campos editáveis pelo proprietário

- Nome profissional (`full_name`).
- Nome da agência (`agency_name`).
- Mercados de atuação (`markets`).
- Instagram (`instagram`).
- Telefone/WhatsApp (`phone`).
- E-mail de contato (`contact_email`).
- Apresentação profissional (`bio`, nova coluna opcional, limite de 800 caracteres).

### 4.2 Campos somente leitura

- Nível da licença (`license_level`).
- Situação da verificação (`verified_status`).
- Identificador do usuário e do agente.

O trigger de proteção do agente continua impedindo que o próprio usuário altere `verified_status` ou `user_id`.

## 5. Atletas representados

Um atleta pertence ao painel quando:

- `atletas.agent_id = agentes.id`;
- o agente é proprietário de `agentes.user_id = auth.uid()`;
- `atletas.claim_status = 'claimed'`;
- `agentes.verified_status = 'verified'` para gravações.

### 5.1 Campos editáveis diretamente

- Apelido (`apelido`).
- Pé dominante (`dominant_foot`).
- Altura (`height_cm`).
- Peso (`weight_kg`).
- Posição secundária (`posicao_secundaria`).
- Vídeo não listado do YouTube (`youtube_video_url`).

O modal apresenta os demais dados relevantes como somente leitura. O campo de vídeo inclui um tutorial curto explicando como copiar o link de um vídeo não listado; o tutorial não altera configurações do YouTube.

### 5.2 Campos institucionais bloqueados

Incluem BID, nome civil, nascimento, nacionalidade, passaporte, posição principal, início de carreira, clube, categoria, contrato, experiência internacional, suspensões, vínculo com agente, situação da reivindicação e estatísticas originadas das súmulas.

Esses dados só podem ser corrigidos por solicitação e posterior decisão administrativa.

## 6. Sugestões de correção

Cada solicitação contém:

- Atleta representado.
- Campo a corrigir, selecionado de uma lista fechada de campos institucionais.
- Valor atual capturado pela aplicação.
- Valor sugerido obrigatório.
- Justificativa obrigatória.
- Link de comprovação opcional.
- Situação: `pending`, `approved` ou `rejected`.
- Datas e revisor quando houver decisão administrativa.

Depois do envio, o agente pode consultar a solicitação, mas não pode editar nem excluir. Nesta fase, o administrador apenas supervisiona no Painel do Agente; a ação de aprovar ou rejeitar será implementada na Fase 5.

O banco impede criar solicitação para atleta que não seja representado pelo solicitante. Clube e outro agente não conseguem inserir ou consultar a solicitação.

## 7. Alterações no Supabase

Uma migração versionada e idempotente deve:

1. Adicionar `agentes.bio text` com validação de até 800 caracteres.
2. Atualizar `guard_atleta_update()` para permitir ao agente proprietário somente os seis campos definidos na seção 5.1.
3. Manter todos os outros campos protegidos e preservar a exceção administrativa.
4. Tornar `solicitacoes_correcao.reason` obrigatório para novos registros e validar conteúdo não vazio.
5. Restringir `field_name` a uma lista institucional permitida.
6. Substituir a política de inserção de correções para exigir agente aprovado, verificado e proprietário do atleta reivindicado.
7. Preservar a política de leitura do próprio solicitante e a leitura administrativa.
8. Preservar atualização e exclusão exclusivamente administrativas.
9. Garantir índices nas colunas usadas pelas políticas e consultas.
10. Espelhar o estado final em `supabase/schema.sql`.

As políticas usam `TO authenticated`, `auth.uid()`, predicados de propriedade e `USING`/`WITH CHECK` quando aplicável. Toda tabela pública permanece com RLS habilitada. Nenhuma chave `service_role` entra no cliente.

Referências verificadas: [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) e [Supabase SSR para Next.js](https://supabase.com/docs/guides/auth/server-side/nextjs).

## 8. Arquitetura da aplicação

- `app/(app)/agente/page.tsx`: guarda por papel e carregamento server-side inicial.
- `lib/services/agent-panel.ts`: consultas e mutações tipadas do painel.
- `components/agente/AgentPanel.tsx`: composição das seções e coordenação de estado.
- Componentes menores para indicadores, perfil, lista de atletas, edição, tutorial e correções.
- `AppNav` recebe a entrada do painel, visível para agente e administrador. Para isso, o papel da sessão passa a ser considerado pela navegação.
- Dicionários PT, EN e ES recebem todas as novas mensagens.

O carregamento inicial usa o cliente Supabase do servidor com a sessão corrente. Mutações usam o cliente autenticado do navegador e dependem de RLS/trigger para autorização final.

## 9. Fluxos de gravação e falhas

- Formulários validam formato e limites antes do envio.
- A interface só confirma sucesso depois da resposta do Supabase.
- Em falha, os valores confirmados anteriormente permanecem e uma mensagem clara é exibida.
- Mutações simultâneas do mesmo formulário ficam bloqueadas.
- Falha no carregamento inicial mostra um estado de erro com ação para tentar novamente.
- Ausência de linha em `agentes` para uma conta `agent` mostra erro de configuração, sem criar perfil silenciosamente no cliente.
- Nenhuma falha utiliza dados mock como substituição de dados privados reais.

## 10. Segurança e validação

### 10.1 Banco

Verificar no projeto real:

- Agente proprietário lê e edita seu perfil.
- Outro agente não edita o perfil nem os atletas do primeiro.
- Clube não usa as mutações do painel.
- Agente proprietário altera somente os seis campos autorizados do atleta.
- Tentativa direta de alterar BID, clube, posição principal, contrato ou vínculo falha.
- Correção só pode ser criada para atleta representado.
- Correção enviada não pode ser alterada ou excluída pelo agente.
- Administrador conserva acesso de supervisão e administração previsto pelo schema.
- Advisors não apresentam novo problema de segurança causado pela migração.

### 10.2 Aplicação

- Testes unitários das listas de campos e validações.
- Testes das transformações de payload, limites e mensagens de erro.
- Testes existentes de comparação e prancheta continuam passando.
- TypeScript e build de produção aprovados.
- Navegação por teclado, nomes acessíveis, foco visível e alvos de toque.
- Layout responsivo e temas claro/escuro.
- PT, EN e ES completos.

## 11. Fora do escopo

- Aprovar ou rejeitar solicitações no painel administrativo.
- Concluir o fluxo de reivindicação de atleta ainda vago (Fase 4.3).
- Reivindicação de posse de clubes (Fase 4.2).
- Upload de documentos ou vídeos para Storage.
- Alterar estatísticas extraídas das súmulas diretamente.
- Mudar o design Matchday Premium aprovado.
