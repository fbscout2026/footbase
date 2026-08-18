# FOOTBASE — Fase 4.4: Painel de Gestão do Clube

Data: 12 de agosto de 2026  
Status: implementado e aplicado no live — **revisado (Session 17) para modelo read-only**

> **REVISÃO (Session 17) — leia primeiro.** Direção de produto atualizada pelo usuário: o clube **não declara** competição, elenco nem escudo. Categorias, torneios, composição de elenco e escudo são captados das **súmulas oficiais / SEED** pela ingestão (service_role) ou curadoria admin. O painel `/clube` é **read-only** nessas abas; o clube só edita o **perfil operacional** e **sugere** correções institucionais (agora incluindo `crest`, cujo valor sugerido é o link do escudo proposto). Não há upload de escudo pelo clube (o `POST` da rota de escudo foi removido). A posse é resolvida pela **fusão semente↔cadastro** na aprovação administrativa por **busca de nome** (Fase 5.4). As seções abaixo que descrevem declaração manual de categorias/torneios/elenco e upload de escudo ficam como registro histórico do desenho original; o contrato vigente é o do `CLAUDE.md` (seção "Club Management Panel Contract — Fase 4.4") e o Session 17 em `PROJECT_STATE.md`. Estado de banco: migrações `20260812190000` + `20260812200000` aplicadas; `club_panel_security.sql` (reescrito) passou.

## 1. Objetivo

Criar a rota `/clube` para que uma conta `club` aprovada e com posse validada administre seu perfil operacional, escudo, categorias, torneios declarados, atletas favoritos e solicitações de alteração do elenco. O painel preserva o Matchday Premium, a autoridade dos dados oficiais, o histórico administrativo e o contrato do futuro scraper.

## 2. Princípios

1. O clube administra dados operacionais diretamente, mas apenas sugere mudanças institucionais ou esportivas que possam conflitar com fontes oficiais.
2. Declaração do clube, confirmação administrativa e confirmação por fonte oficial permanecem distinguíveis.
3. Solicitações de elenco não alteram o elenco público antes da aprovação.
4. O scraper confirma ou aponta divergências; nunca apaga declarações, posse ou decisões administrativas.
5. Toda conta administra somente o clube que reivindicou e teve aprovado.
6. O design atual não será reorganizado. A nova área usa o baseline Matchday Premium e a navegação existente.

## 3. Escopo

### Incluído na Fase 4.4

- rota protegida `/clube`;
- visão geral do clube;
- edição de dados operacionais;
- upload e substituição controlada do escudo;
- categorias declaradas pelo clube;
- torneios atuais por categoria;
- solicitações de entrada, retirada e mudança de categoria de atletas por BID;
- solicitação de cadastro quando o BID ainda não existe no FOOTBASE;
- seção de favoritos reutilizando `favoritos`;
- indicadores de pendência e divergência;
- supervisão administrativa inicialmente somente leitura;
- clube demonstrativo isolado para `clube.teste@footbase.dev`;
- RLS, gatilhos, serviços, i18n e testes.

### Fora da Fase 4.4

- aprovação/rejeição administrativa pela interface, prevista para a Fase 5;
- ingestão e conciliação automática pelo scraper, prevista para a Fase 6;
- criação direta de atletas oficiais pelo clube;
- alteração direta de nome oficial, CNPJ, federação, BID ou identificadores externos;
- exclusão física de histórico, solicitações, conflitos ou escudos substituídos.

## 4. Elegibilidade e acesso

- `/clube` exige sessão aprovada com `profiles.role = club`.
- A conta precisa estar vinculada a exatamente um `clubes.id` por `reivindicado_por`, com `claim_status = claimed`.
- Conta de clube sem posse aprovada visualiza apenas o estado da reivindicação e orientação para concluir o vínculo.
- Agentes são redirecionados ao dashboard.
- Administradores podem selecionar um clube e supervisionar o painel em modo somente leitura nesta fase.
- A navegação exibe “Painel do clube” somente para clube elegível; admin terá acesso pela futura central de supervisão.

## 5. Organização da interface

Foi aprovada a opção B: uma central com visão geral e abas internas, sem menu lateral adicional.

### 5.1 Visão geral

- identificação e estado da posse;
- métricas de atletas, categorias, torneios, solicitações e divergências;
- completude do perfil e do escudo;
- ações rápidas para solicitar atleta, cadastrar categoria e informar torneio;
- fila de alertas, pendências e divergências.

### 5.2 Perfil

Edição direta:

- nome de exibição opcional;
- descrição;
- endereço da sede;
- cidade e estado;
- telefone e WhatsApp;
- e-mail institucional;
- site;
- Instagram e outras redes aprovadas;
- escudo.

Alteração por solicitação:

- nome oficial;
- CNPJ;
- federação;
- `source_key` e demais identificadores institucionais.

### 5.3 Elenco

- elenco oficial agrupado por categoria;
- busca por nome ou BID;
- solicitações de entrada, retirada e mudança de categoria;
- justificativa obrigatória e comprovante HTTP(S) opcional;
- estados `pending`, `approved`, `rejected` e `conflict`;
- histórico preservado e visível ao clube solicitante;
- pendências visíveis somente ao clube proprietário e à administração.

### 5.4 Categorias e torneios

- categorias ativas ou arquivadas;
- ordenação operacional das categorias;
- torneios por categoria, temporada, datas e situação;
- situações: `registered`, `in_progress`, `finished` e `withdrawn`;
- origem visível: `club_declared`, `admin_confirmed` ou `official_confirmed`;
- informação declarada pode aparecer publicamente com selo “Informado pelo clube”;
- informação confirmada aparece com selo “Confirmado”.

### 5.5 Favoritos

- reutiliza `favoritos` da conta autenticada;
- mostra atleta, BID, nota, observação e link para o dossiê;
- mantém isolamento por `user_id`;
- não confunde favorito privado com atleta do elenco.

## 6. Fluxo do elenco

### 6.1 Atleta existente

1. O clube pesquisa o BID.
2. Escolhe `add`, `remove` ou `change_category`.
3. Informa categoria proposta, quando aplicável, justificativa e comprovante opcional.
4. O banco captura o vínculo e a categoria oficiais atuais.
5. A solicitação permanece pendente sem alterar `atletas.current_club_id` ou `current_category`.
6. Na Fase 5, a administração aprova ou rejeita.
7. A aprovação executa a mudança oficial de forma atômica e registra revisor/data.

### 6.2 BID inexistente

- o clube cria uma solicitação de cadastro com BID, nome informado, data de nascimento quando disponível, categoria e evidência;
- nenhum registro oficial de `atletas` é criado pelo cliente;
- administração ou scraper valida o BID antes da criação institucional.

### 6.3 Concorrência e conflitos

- uma solicitação pendente equivalente por clube/BID/ação;
- solicitações contraditórias são bloqueadas ou marcadas para revisão;
- divergência posterior do scraper não altera automaticamente a posse ou o elenco;
- a divergência registra valores declarados e oficiais para decisão administrativa.

## 7. Escudo e armazenamento

- entrada aceita PNG, JPEG ou WebP;
- conversão para WebP antes do armazenamento;
- dimensão máxima final de `120 × 120 px`;
- tamanho máximo final de `50 KB`;
- o servidor revalida assinatura real, MIME, dimensão e tamanho;
- bucket Supabase Storage `club-crests` com políticas por clube proprietário;
- caminho estável inclui o UUID do clube, não o nome;
- banco armazena apenas caminho/URL e metadados mínimos;
- substituição arquiva o objeto anterior por período recuperável, sem exclusão imediata;
- upload falho não altera o escudo atual.

A conversão no cliente melhora a experiência, mas não é uma barreira de segurança. A validação e eventual recompressão server-side são autoritativas.

## 8. Modelo de dados proposto

### 8.1 Extensão de `clubes`

Campos operacionais opcionais:

- `display_name`;
- `description`;
- `headquarters_address`;
- `headquarters_city`;
- `headquarters_state`;
- `phone`;
- `whatsapp`;
- `contact_email`;
- `website_url`;
- `instagram_url`;
- `crest_storage_path`;
- `updated_at`.

O clube proprietário recebe uma allowlist exata apenas para esses campos. `id`, `name`, `source_key`, `federacao`, `reivindicado_por`, `claim_status` e auditoria permanecem protegidos.

### 8.2 `club_categorias`

- `id`, `club_id`, `category`;
- `status` (`active` ou `archived`);
- `display_order`;
- `source_status`;
- `declared_by`, `confirmed_by`, `confirmed_at`;
- timestamps;
- unicidade por clube/categoria não arquivada.

### 8.3 `club_categoria_torneios`

- `id`, `club_category_id`;
- `tournament_id` opcional quando já existir em `torneios`;
- nome declarado quando ainda não existir oficialmente;
- temporada, início e fim;
- situação;
- `source_status`;
- autoria, confirmação e timestamps.

### 8.4 `club_elenco_solicitacoes`

- clube, BID opcional e BID informado;
- nome informado para BID inexistente;
- ação solicitada;
- categoria atual capturada e categoria proposta;
- clube oficial atual capturado;
- justificativa e comprovante;
- status, revisor e data;
- timestamps e histórico imutável para o clube.

### 8.5 `club_correction_requests`

- clube, campo institucional permitido;
- valor atual capturado pelo banco;
- valor sugerido, motivo e comprovante;
- status, revisão e timestamps;
- update/delete apenas administrativo.

### 8.6 `club_divergencias`

- clube, domínio (`profile`, `roster`, `category`, `tournament`);
- entidade/campo afetado;
- valor declarado e valor oficial em formato controlado;
- origem oficial;
- status (`open`, `resolved_club`, `resolved_official`, `dismissed`);
- resolução, revisor e timestamps.

### 8.7 Favoritos

Nenhuma nova tabela. A seção consome `favoritos` e as políticas existentes.

## 9. Segurança e RLS

- todas as novas tabelas em `public` terão RLS habilitada;
- leitura/escrita do clube exige `auth.uid()` igual ao proprietário reivindicante do `club_id` e conta aprovada;
- políticas usam `TO authenticated` com predicado de ownership, nunca apenas o papel PostgreSQL;
- papéis são lidos de `profiles`, não de `user_metadata`;
- inserts capturam autoria pelo banco e não confiam em IDs enviados pelo cliente;
- guards usam allowlists exatas;
- mudanças oficiais e revisões permanecem administrativas;
- funções de trigger usam `search_path` fixo e têm EXECUTE revogado quando não forem RPCs públicas;
- `service_role` continua apto à ingestão, mas o contrato do scraper proíbe sobrescrever declarações, posse, decisões e favoritos;
- upload no Storage só aceita o prefixo do clube proprietário e o arquivo validado;
- ações administrativas futuras serão atômicas e auditadas.

## 10. Compatibilidade com o scraper

- nenhuma chave atual será renomeada ou removida;
- `atletas.bid`, `clubes.source_key` e IDs de torneio permanecem estáveis;
- o scraper continua responsável pelos dados oficiais de súmula;
- ao encontrar diferença, cria/atualiza `club_divergencias` ou confirma uma declaração compatível;
- nunca altera diretamente declarações históricas, favoritos, solicitações ou decisões;
- alterações futuras seguem expand/contract, dry-run, amostra real, backup e rollback.

## 11. Clube demonstrativo

- criar “FOOTBASE Clube de Demonstração” com `source_key` exclusiva de teste;
- vincular somente ao UUID da conta `clube.teste@footbase.dev`;
- não reutilizar Flamengo, Palmeiras, Vasco, Fluminense ou Santos;
- dados do clube demonstrativo devem ser claramente identificáveis e removíveis por UUID/source key exatos;
- nenhuma ação de demonstração altera atletas oficiais automaticamente.

## 12. Tratamento de erros

- falha de upload preserva o escudo atual;
- arquivo inválido informa tipo, dimensão ou tamanho incompatível sem expor detalhes internos;
- conflito de concorrência recarrega o estado antes de permitir novo envio;
- falhas de leitura exibem estado de retry;
- erros SQL/RLS não são mostrados ao usuário;
- ação só aparece concluída após confirmação do Supabase;
- formulários preservam valores quando o envio falha.

## 13. Testes e aceite

### Regras e interface

- resolução de acesso para clube com/sem posse, agente e admin;
- validação de URL, campos operacionais e solicitações;
- estados de categorias, torneios, elenco e divergências;
- favoritos permanecem privados e separados do elenco;
- abas e formulários acessíveis por teclado;
- PT/EN/ES completos e Matchday Premium preservado.

### Escudo

- PNG/JPEG/WebP válidos convertidos;
- resultado WebP até 120 × 120 e 50 KB;
- assinatura/MIME falsos rejeitados;
- arquivo acima do limite rejeitado ou recomprimido antes do commit;
- usuário de outro clube não lê/escreve o prefixo privado;
- falha não troca a referência atual.

### Banco e autorização

- clube proprietário altera apenas campos operacionais permitidos;
- outro clube, agente e clube sem posse são bloqueados;
- solicitação de elenco não altera atleta oficial;
- valor atual de correção é capturado pelo banco;
- evidências e solicitações são privadas e imutáveis pelo clube;
- categorias/torneios preservam origem e autoria;
- operações administrativas futuras são o único caminho para alterar dados oficiais;
- teste transacional deixa zero resíduos;
- Advisor sem erros de segurança.

### Regressão

- testes existentes de comparação, prancheta, agente, clubes e reivindicação de atleta;
- TypeScript;
- build de produção;
- validação visual das contas `.dev`;
- conferência das contagens e vínculos protegidos antes/depois.

## 14. Sequenciamento

1. Fase 4.4: schema compatível, Storage, painel, perfil, categorias/torneios, favoritos, solicitações e clube demonstrativo.
2. Fase 5: aprovação de elenco, correções institucionais e resolução de divergências na interface administrativa.
3. Fase 6: confirmação automática e geração de divergências pelo scraper.

O painel pode ser entregue antes da interface administrativa: as solicitações ficam registradas e pendentes, sem produzir alterações oficiais até a Fase 5.
