# Plano de implementação — Fase 4.4 Painel de Gestão do Clube

**Especificação aprovada:** `docs/superpowers/specs/2026-08-12-club-management-panel-design.md`  
**Data:** 12 de agosto de 2026  
**Estado:** aprovado e em implementação local; checkpoint detalhado em `PROJECT_STATE.md`; ainda não publicado no Supabase

## Resultado esperado

Entregar `/clube` como central protegida da conta de clube, com visão geral e abas de Perfil, Elenco, Categorias e torneios e Favoritos. O clube poderá editar somente informações operacionais, manter declarações próprias e registrar solicitações sem alterar dados oficiais antes da aprovação administrativa.

## 1. Regras puras e contratos testáveis

### Arquivos

- criar `lib/club-panel-rules.ts`;
- criar `lib/club-panel-rules.test.mjs`;
- atualizar `package.json` com `test:club-panel`;
- adicionar `sharp` como dependência direta para que a conversão server-side não dependa de uma dependência transitiva do Next.js.

### Implementação

- definir os tipos de acesso `owner`, `admin-readonly`, `unclaimed`, `forbidden` e `unavailable`;
- normalizar e validar dados operacionais, URLs HTTP(S), estado, telefones, descrição e contatos;
- validar categorias, ordenação, temporada, datas e estados de torneio;
- validar `add`, `remove`, `change_category` e `register_missing_bid`;
- exigir justificativa e validar comprovante opcional HTTP(S);
- rejeitar combinações incoerentes, como retirada com categoria proposta ou mudança sem nova categoria;
- manter todas essas regras sem dependência de React ou Supabase.

### Testes

- limites mínimos e máximos de todos os campos;
- URLs válidas e inválidas;
- cada estado de acesso;
- cada tipo de solicitação de elenco;
- intervalos de datas e estados de torneio;
- normalização sem perda de acentos e sem aceitar texto vazio.

## 2. Migração compatível e schema consolidado

### Arquivos

- criar `supabase/migrations/20260812XXXXXX_club_management_panel.sql` com timestamp ainda não utilizado;
- espelhar o estado final em `supabase/schema.sql`;
- criar `supabase/tests/club_panel_security.sql`.

### Extensão de `clubes`

- adicionar os campos operacionais opcionais aprovados;
- adicionar validações de tamanho e formato que também existam na interface;
- adicionar `updated_at` com preenchimento automático;
- criar trigger com allowlist exata para o clube proprietário;
- proteger `id`, nome oficial, CNPJ, federação, `source_key`, posse, estado da reivindicação, criação e auditoria;
- preservar os bypasses administrativos existentes sem reabrir autoelevação de `profiles`.

### Novas tabelas

- criar `club_categorias` com unicidade adequada, origem, autoria, confirmação e arquivamento lógico;
- criar `club_categoria_torneios` com torneio oficial opcional, nome declarado, temporada, datas, status e origem;
- criar `club_elenco_solicitacoes` com snapshots oficiais capturados pelo banco;
- criar `club_correction_requests` com valor atual capturado pelo banco;
- criar `club_divergencias` preparada para consumo administrativo e futuro scraper;
- usar checks/enums controlados, FKs, índices de consulta e índices únicos parciais para pendências equivalentes;
- impedir exclusão física pelo clube e impedir alteração de histórico, autoria, status ou snapshots.

### Funções e RLS

- criar helper privado para resolver o único clube reivindicado pela conta aprovada;
- fixar `search_path`, revogar `EXECUTE` público e conceder somente o estritamente necessário;
- habilitar RLS em todas as novas tabelas;
- permitir ao clube ler somente registros do próprio clube;
- permitir inserts/updates somente nas declarações autorizadas e com autoria preenchida pelo banco;
- manter revisão, confirmação, resolução e alteração oficial exclusivamente administrativas;
- permitir ao admin leitura transversal sem conceder mutação pela interface desta fase;
- documentar no SQL que `service_role` é reservado à ingestão e não autoriza substituir declarações ou decisões.

## 3. Storage privado e processamento do escudo

### Arquivos

- criar `lib/club-crest.ts` para assinatura, dimensão, enquadramento e limites;
- criar `lib/club-crest.test.mjs` para regras independentes de imagem;
- criar `lib/supabase/admin.ts` para cliente server-only com `SUPABASE_SERVICE_ROLE_KEY`;
- criar `app/api/clube/crest/route.ts`;
- atualizar `.env.example` sem registrar qualquer segredo real.

### Fluxo

1. O navegador envia PNG, JPEG ou WebP para a rota autenticada.
2. A rota confirma sessão aprovada, papel `club` e posse do clube.
3. O servidor valida assinatura real e decodifica a imagem com `sharp`.
4. A imagem é orientada, contida em `120 × 120`, convertida para WebP e recomprimida até no máximo 50 KB.
5. O servidor grava uma nova versão em `club-crests/{club_id}/versions/{uuid}.webp` usando a chave server-only.
6. A referência em `clubes.crest_storage_path` muda somente depois do upload confirmado.
7. A versão anterior permanece no bucket como arquivo recuperável; falhas removem apenas a nova versão incompleta quando aplicável.

### Políticas

- criar bucket privado `club-crests` com limite de arquivo e MIME WebP;
- não conceder upload direto ao cliente, evitando contorno da validação dimensional;
- gerar URL assinada de leitura no servidor apenas para o caminho corrente;
- manter versões antigas inacessíveis pela interface comum;
- garantir que a chave de serviço nunca seja importada por Client Components.

## 4. Serviço do painel

### Arquivos

- criar `lib/services/club-panel.ts`;
- atualizar `lib/services/clubs.ts` apenas onde for necessário expor o escudo atual e manter compatibilidade do diretório;
- reutilizar `lib/services/favorites.ts` sem criar tabela paralela.

### Consultas e comandos

- resolver o contexto do painel pelo usuário autenticado, nunca por um `club_id` fornecido por conta de clube;
- permitir `?club=<uuid>` somente para supervisão administrativa read-only;
- carregar clube, escudo assinado, elenco oficial, categorias, torneios, favoritos, solicitações e divergências;
- devolver um objeto único e tipado para hidratar o painel;
- implementar comandos para perfil operacional, categoria, torneio, solicitação de elenco e correção;
- esperar a confirmação do Supabase antes de atualizar a interface;
- mapear erros esperados para códigos amigáveis sem expor detalhes SQL/RLS.

## 5. Rota protegida e estados de acesso

### Arquivos

- criar `app/(app)/clube/page.tsx`;
- criar `app/(app)/clube/loading.tsx`;
- criar `app/(app)/clube/error.tsx` se o tratamento segmentado trouxer ganho sobre o boundary existente;
- atualizar `components/app/AppNav.tsx`.

### Comportamento

- clube aprovado e proprietário acessa o painel editável;
- clube sem posse recebe orientação e link ao diretório/reivindicação;
- agente é redirecionado ao dashboard;
- admin recebe seleção de clube e painel somente leitura;
- usar uma `key` baseada no clube supervisionado para impedir vazamento de estado entre seleções;
- mostrar “Painel do clube” na navegação apenas para o papel aplicável.

## 6. Interface Matchday Premium com abas

### Arquivos propostos

- criar `components/clube/ClubManagementPanel.tsx`;
- criar `components/clube/ClubPanelTabs.tsx`;
- criar `components/clube/ClubOverview.tsx`;
- criar `components/clube/ClubProfileForm.tsx`;
- criar `components/clube/ClubCrestUploader.tsx`;
- criar `components/clube/ClubSquadManager.tsx`;
- criar `components/clube/ClubCategoriesManager.tsx`;
- criar `components/clube/ClubFavorites.tsx`;
- criar pequenos componentes locais de status/alerta somente quando reduzirem duplicação.

### Requisitos visuais e de uso

- preservar a organização global, header grafite fixo, logo clara, verde `#4CBB17`, temas claro/escuro, largura integral e cantos retos;
- não criar segundo menu lateral;
- usar abas acessíveis com teclado e estado selecionado anunciado;
- manter alvos de toque de pelo menos 44 px, foco visível e contraste aprovado;
- tornar tabelas responsivas sem ocultar informação essencial;
- diferenciar “Informado pelo clube”, “Confirmado”, “Pendente” e “Divergência” sem depender somente de cor;
- preservar valores de formulário em falhas;
- separar explicitamente favoritos privados do elenco oficial.

## 7. Internacionalização

### Arquivo

- atualizar `lib/i18n/dictionaries.ts`.

### Conteúdo

- adicionar todas as chaves do painel em PT, EN e ES;
- cobrir abas, campos, estados vazios, confirmações, validações, upload, origem dos dados e mensagens de erro;
- verificar paridade de chaves entre os três idiomas;
- evitar textos institucionais codificados diretamente nos componentes.

## 8. Clube demonstrativo isolado

### Arquivo

- criar `supabase/seeds/club_panel_demo.sql` como bootstrap idempotente separado da migração reutilizável.

### Dados

- localizar a conta `clube.teste@footbase.dev` pelo UUID já validado no ambiente autorizado;
- criar ou atualizar “FOOTBASE Clube de Demonstração” por `source_key` exclusiva;
- vincular somente essa conta, com `claim_status = claimed`;
- inserir categorias e torneios claramente demonstrativos;
- não vincular nem modificar os atletas oficiais existentes;
- permitir limpeza futura por UUID e `source_key` exatos.

## 9. Testes de banco e segurança

### Cenários do teste transacional

- proprietário altera somente os campos operacionais permitidos;
- tentativa de alterar nome oficial, posse, estado da reivindicação, IDs ou auditoria falha;
- outro clube, clube sem posse e agente não leem nem alteram dados privados;
- admin lê todas as linhas e caminhos administrativos permanecem separados;
- autoria e snapshots são sempre definidos pelo banco;
- solicitação de elenco não muda `atletas.current_club_id` nem categoria;
- solicitações equivalentes pendentes não duplicam;
- registro de correção não pode ser alterado ou apagado pelo clube;
- favorito permanece visível apenas ao seu `user_id`;
- Storage rejeita escrita autenticada direta e prefixo indevido;
- o teste termina com rollback e zero resíduos.

## 10. Validação local completa

- executar `npm run test:club-panel`;
- executar testes do escudo;
- executar `test:clubs`, `test:athlete-claims`, `test:agent-panel`, `test:comparison` e `test:prancheta`;
- executar TypeScript sem incremental;
- executar build de produção;
- validar manualmente `/clube` com conta de clube, agente e admin;
- validar temas, 320 px, tablet e desktop;
- verificar navegação por teclado, foco, nomes acessíveis e contraste;
- confirmar que não existe fallback mock em caso de falha real de dados.

## 11. Publicação controlada no Supabase

- registrar contagens e vínculos protegidos antes da migração;
- aplicar a migração no projeto autorizado `tqehidwpqwkcbxyducmz`;
- criar/verificar o bucket privado e suas restrições;
- executar o teste SQL transacional no banco live;
- executar o bootstrap do clube demonstrativo;
- validar login real de `clube.teste@footbase.dev` sem registrar a senha em código, logs ou documentação;
- conferir Security Advisor e Performance Advisor;
- comparar contagens e vínculos antes/depois;
- se qualquer validação falhar, interromper a publicação, preservar os dados existentes e corrigir antes de prosseguir.

## 12. Revisão final e continuidade

- revisar o diff completo com foco em autorização, isolamento, escudo, acessibilidade e compatibilidade com scraping;
- atualizar `PROJECT_STATE.MD`, `CLAUDE.MD` e `PLANO_EXECUCAO_V3.md` com arquivos, migração live, contrato do scraper e próximo passo;
- registrar a Fase 4.4 como concluída somente após banco live, testes e interface aprovados;
- indicar Fase 5 como próximo passo: aprovações administrativas de elenco/correções e resolução de divergências;
- manter Fase 6 reservada à integração periódica do scraper.

## Ordem de execução e pontos de parada

1. Regras e testes puros.
2. Migração, schema e teste SQL.
3. Escudo e Storage.
4. Serviços e rota protegida.
5. Interface e idiomas.
6. Testes locais e revisão.
7. Migração live e clube demonstrativo.
8. Validação real, documentação e encerramento.

Não será executada aprovação automática de elenco, correção oficial nem conciliação do scraper nesta fase. Esses limites permanecem explícitos para evitar que a Fase 4.4 introduza mutações oficiais antes dos fluxos administrativos correspondentes.
