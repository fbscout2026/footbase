# ⚽ FOOTBASE — Claude Code Guidelines & Behavioral Rules

## 🎯 System Role & Behavior
- You are a senior full-stack developer building **FOOTBASE**, a B2B football scouting platform for Brazilian youth categories (SUB-11 to SUB-20).
- Write clean, modular, and type-safe Next.js 15 (App Router) TypeScript code.
- Always write responses and comments clearly, maintaining high standard architectural practices.

## 🎨 Brand & Design System Rules
> Direção oficial aprovada: **Matchday Premium**. Especificação: `docs/superpowers/specs/2026-08-12-matchday-premium-redesign-design.md`. Tokens ficam em `app/globals.css`; componentes usam classes semânticas e nunca hardcode de cores.
> Refinamentos obrigatórios: `docs/superpowers/specs/2026-08-12-full-width-and-board-zoom-design.md`; para `/agente`, `docs/superpowers/specs/2026-08-12-agent-panel-design.md`; para clubes, `docs/superpowers/specs/2026-08-12-club-profile-ownership-design.md`.
- **Official palette:** Verde Campo `#4CBB17`, Grafite Escuro `#121212`, Branco Puro `#FFFFFF`. Transparências desses tons podem criar superfícies, bordas e elevação. Cores semânticas são permitidas apenas para feedback funcional.
- **Dark theme:** canvas grafite, superfícies derivadas de branco em baixa opacidade, texto branco e verde para ação/destaque.
- **Light theme:** canvas e superfícies brancos, texto grafite e verde para ação/destaque.
- **Top headers:** landing e sistema interno usam Grafite `#121212` fixo nos dois temas, sem gradiente e sem mudança de cor.
- **Logo Assets:** os dois cabeçalhos superiores usam sempre a logo clara oficial. A variação preta pode ser usada apenas em outras superfícies brancas. Preserve o ponto verde e nunca recomponha a marca como texto.
- **Geometry:** evitar cantos arredondados. Cards e blocos informativos são retos; raios pequenos ficam restritos a controles nos quais ajudam reconhecimento ou ergonomia.
- **Typography:** títulos de seção/widget são bold, itálicos e em caixa alta; conteúdo e dados permanecem neutros e altamente legíveis.
- **UI Paradigm:** Matchday Premium, data-dense e **full-width** tanto na landing quanto no sistema interno. Fundos, linhas e molduras das seções públicas chegam às bordas da viewport; não reintroduza `max-w-*` no wrapper externo do cabeçalho ou das seções da landing. O conteúdo usa paddings responsivos. Gradientes e referências de campo funcionam apenas como moldura de conteúdo, nunca no cabeçalho.
- **Tactical Board Zoom:** preservar os controles locais de 60% a 140%, passo de 10% e reset em 100%. O zoom altera somente a visualização do campo e dos atletas, usa overflow interno e nunca é persistido no Supabase.
- **Media Constraints:** Only compressed `.webp` club/federation crests (max 120x120px), served from `public/crests/`. **No player photos** in the MVP.

## 🔒 Approved UI Preservation Contract
- O design atual está **aprovado e congelado como baseline visual**. Novas tarefas devem alterar ou adicionar informações e funcionalidades dentro dos padrões existentes; não devem redesenhar a landing, autenticação, cabeçalhos, dashboard, atletas, comparação ou prancheta sem autorização explícita do usuário.
- Preserve a organização, ordem das seções, hierarquia visual, espaçamento, tipografia, paleta, temas claro/escuro, cantos retos, cabeçalhos grafite e logos oficiais.
- Antes de editar UI, leia `PROJECT_STATE.md` e as especificações aplicáveis em `docs/superpowers/specs/`. Reutilize `matchday-surface`, `matchday-heading`, tokens de `app/globals.css` e componentes de `components/ui/`.
- Não substitua os SVGs oficiais, não reconstrua a marca como texto e não introduza novas cores de marca, gradientes de cabeçalho, containers centrais com laterais vazias ou cantos arredondados em cards informativos.
- Se uma funcionalidade nova exigir mudança estrutural ou visual fora desse contrato, pare e solicite aprovação explícita do usuário antes de implementá-la.

## ⚙️ Tech Stack Standards
- **Framework:** Next.js 15 App Router (`app/` directory).
- **Styling:** Tailwind CSS + `lucide-react` icons.
- **Database / Auth:** Supabase (`@supabase/ssr` with cookie-based session management).
- **Ingestion (Fase 6, free-first — sem Firecrawl):** as súmulas oficiais são **PDFs estáticos com camada de texto** em `conteudo.cbf.com.br/sumulas/{ano}/{código}se.pdf` → `fetch` + `pdf-parse` (grátis, sem OCR). A **descoberta** da CBF usa **`fetch` puro** — a página de tabela embute o `competitionId`/contagem de rodadas, e uma API JSON pública (`/api/cbf/jogos/campeonato/{id}/rodada/{n}/fase`) devolve os jogos com o link da súmula pronto; `cbf.com.br` não tem bot-detection, então nenhuma parte da CBF precisa de Playwright. FPF continua usando Playwright (site atrás de Cloudflare) — fonte pendente por ora. Firecrawl fica apenas como adaptador opcional na abstração de "buscador" em `lib/services/scraper`. Não reintroduza Firecrawl como dependência obrigatória.
- **Primary Entity Key:** `atletas.bid` = **ID CBF do atleta de 6 dígitos** (o identificador da coluna "CBF" da súmula, ex.: `718455`), como `bigint`. É a chave estável dos upserts idempotentes. (Os `bid` de 11 dígitos do mock são placeholders e serão superados pela ingestão real.)
- **Precedência da súmula (fonte da verdade):** quando dados **factuais/institucionais** manuais/semente divergirem da súmula, **a súmula vence e sobrescreve** (bio do atleta, dados do clube, estatísticas de partida). Dados de **governança/curadoria** — posse (`clubes.reivindicado_por`/`claim_status`), `atletas.agent_id`/`claim_status`, favoritos/notas, pranchetas, solicitações/correções, decisões admin e campos editoriais do clube (`display_name`, `description`, `crest`) — **não** são tocados pelo scraper (a súmula não os contém).
- **Desenho operacional do scraper:** **núcleo único agnóstico + um adaptador por fonte** (CBF/FPF/FERJ…) — nunca monolito por fonte; cada fonte varre todas as suas competições × categorias × rodadas × jogos. Fluxo: a **descoberta** da URL da súmula usa `fetch` puro na CBF (API JSON pública) e Playwright na FPF (site protegido) → `fetch` baixa o PDF → `pdf-parse` extrai → `ingest` grava → **PDF descartado** (memória/`/tmp` apagado; só `partidas_sumula.source_url` fica; disco não cresce). Execução **2×/semana (2ª e 5ª), off-peak, incremental, em cascata** (sequencial com delay por fonte; fontes distintas em paralelo), rate-limit ~1–2 req/s + retry/backoff. **Dry-run obrigatório antes de qualquer escrita live** (liberada só após os gates da 6.5). Cada item processado (súmula) é registrado em `scraping_jobs` (`pending/done/failed`+`attempts`, chave `source+job_type+ref`), lido pelo monitor `/admin`.
- **Escalabilidade e resiliência:** leitura (UI) e ingestão são **desacopladas** — a UI lê só do Postgres, então **falha de scrape nunca quebra a exposição** (dados ingeridos seguem visíveis). Erros por item vão para uma **fila de retry `scraping_jobs`** (`pending/done/failed`+tentativas): pula e retenta no próximo run (idempotente); persistentes aparecem no monitor `/admin`. **Escudo do clube é automático** na ingestão (baixa o escudo oficial → webp ≤120×120 via `lib/club-crest.ts`). **Classificação/tabelas são calculadas** dos resultados ingeridos (não raspadas). Adicionar nova fonte = novo adaptador validado contra amostra real (incremental). **Internacionalizar (Japão/Inglaterra/…) exige generalizar o schema** (categorias além de `SUB-11..SUB-20`, entidade de confederação/país) — migração futura planejada.

## 🧑‍💼 Agent Panel & Authorization Contract
- `/agente` é exclusivo de `agent`; `club` redireciona para `/dashboard`; `admin` supervisiona em modo somente leitura. Ao trocar `?user=`, o painel deve ser remontado com `key={userId}` para nunca reaproveitar estado do agente anterior.
- Perfil do agente: somente `full_name`, `agency_name`, `markets`, `instagram`, `phone`, `contact_email`, `bio` são editáveis pelo próprio agente.
- Atleta reivindicado: somente `apelido`, `dominant_foot`, `height_cm`, `weight_kg`, `posicao_secundaria`, `youtube_video_url` são editáveis. Não amplie esta lista sem aprovação explícita e nova migração/RLS/teste.
- Campos institucionais usam `solicitacoes_correcao`; `current_value` é capturado pelo trigger e solicitações não podem ser atualizadas/excluídas pelo agente.
- Nunca permita signup público como `admin`, autoalteração de `profiles.role/account_status`, nem insert direto do cliente em `profiles`/`agentes`. Os guards usam allowlist exata e aceitam `service_role` para a futura ingestão/scraper.
- Estado live: migrações `20260812130000_agent_panel_phase_4_1.sql` e `20260812133000_revoke_legacy_rls_helper.sql` aplicadas. Após mudanças de autorização, execute `supabase/tests/agent_panel_security.sql` em transação e confirme rollback sem resíduos.

## 🏟️ Club Profile & Ownership Contract
- `/clubes` e `/clubes/[id]` leem exclusivamente o Supabase; não introduza fallback mock. A busca universal de clubes também deve usar UUIDs reais.
- Somente perfil `club` aprovado pode reivindicar. Cada conta pode ter no máximo uma solicitação pendente e um clube; cada clube aceita apenas um solicitante pendente.
- A reivindicação exige `documento_url` HTTP(S) e `mensagem` de 20–2000 caracteres. Evidência, identidade e alvo são imutáveis depois do insert e só o solicitante/admin pode ler a solicitação.
- Preserve os triggers que sincronizam `clubes.claim_status`/`reivindicado_por`; aprovação/rejeição é administrativa. Não exponha a identidade de outro solicitante na UI.
- Estado live: migrações `20260812150000_club_profiles_and_claims.sql` e `20260812153000_club_claim_policy_visibility.sql` aplicadas. Após mudanças, execute `supabase/tests/club_claim_security.sql` e confirme `club_claim_security_passed` + rollback sem resíduos.

## 🏢 Club Management Panel Contract — Fase 4.4 (concluída; revisão read-only aplicada)

- Estado: **concluída e aplicada no live**. Migrações `20260812190000_club_management_panel.sql` e `20260812200000_club_panel_readonly_declarations.sql` aplicadas; `club_panel_security.sql` passou (`club_panel_security_passed`); seed `club_panel_demo.sql` aplicado. Antes de mexer, leia o spec `docs/superpowers/specs/2026-08-12-club-management-panel-design.md` (nota de revisão no topo) e o Session 17 em `PROJECT_STATE.md`.
- **Direção do produto (obrigatória):** o clube **não declara** competição nem elenco. Categorias, torneios e composição de elenco são captados das **súmulas oficiais (CBF/federações)** pela ingestão (service_role) ou curados pelo admin. O painel `/clube` é **read-only** para esses dados. O escudo também é captado automaticamente (SEED/ingestão) e é **read-only** — informativo, não editável.
- `/clube` mantém a organização aprovada: visão geral + abas Perfil, Elenco (read-only), Categorias e torneios (read-only), Favoritos; sem segundo menu lateral e sem redesenhar Matchday Premium.
- Proprietário é resolvido no banco por `clubes.reivindicado_por = auth.uid()` e `claim_status='claimed'`. Conta de clube nunca escolhe arbitrariamente `club_id`; `?club=` é exclusivo da supervisão admin read-only.
- **Único conteúdo editável pelo clube:** perfil operacional (`display_name`, `description`, sede, cidade/UF, telefone, WhatsApp, e-mail, site, Instagram). Identidade, CNPJ, federação, `state`, `source_key`, `crest`, posse e auditoria são protegidos.
- **Canal de mudança do clube = solicitação de correção institucional** (`club_correction_requests`), único insert permitido ao clube. Campos sugeríveis: `name`, `cnpj`, `state`, `federacao`, `source_key`, `crest` (valor sugerido = link do escudo proposto). O trigger captura `current_value`; a solicitação é imutável e revisada pelo admin.
- Escrita de `club_categorias`, `club_categoria_torneios` e `club_elenco_solicitacoes` é **admin/service_role apenas** (RLS). O clube só lê. Nenhum insert altera `atletas`. Origem preservada (`club_declared`/`admin_confirmed`/`official_confirmed`); a ingestão usa `official_confirmed` e nunca sobrescreve posse, favoritos, correções ou decisões administrativas.
- **Escudo:** bucket `club-crests` privado; a rota `app/api/clube/crest/route.ts` expõe **apenas `GET`** (entrega read-only via service_role). **Não há upload pelo clube** (o `POST` foi removido). As libs `lib/club-crest.ts` e as regras de escudo em `lib/club-panel-rules.ts` ficam reservadas ao processamento pela ingestão/admin (Fase 6).
- **Fusão semente↔cadastro (Fase 5):** o clube se cadastra e envia comprovante; a aprovação administrativa faz uma **busca por nome** entre os clubes semente e **funde** a conta ao clube semente existente (define `reivindicado_por`/`claim_status='claimed'`). O clube nunca funde sozinho.
- Não importar `lib/supabase/admin.ts` em Client Components e nunca expor `SUPABASE_SERVICE_ROLE_KEY`.
- Guard `guard_clube_operational_update`: usa `pg_trigger_depth() > 1` para liberar updates aninhados dos triggers de reivindicação (Fase 4.2) e submete apenas o update direto do cliente à allowlist operacional. **Nunca** trocar por `current_user` (a função é SECURITY DEFINER; `current_user` é sempre o dono).

## 🧑‍💼 Athlete Claim & Representation Contract
- O painel de reivindicação do dossiê usa exclusivamente estado real do Supabase; não reintroduza status mock, atualização otimista antes da confirmação do banco nem uma rota paralela.
- Somente conta `agent` aprovada e `agentes.verified_status = verified` pode reivindicar atleta sem representante. O mesmo agente pode solicitar vários atletas, mas cada atleta admite apenas uma solicitação pendente.
- A solicitação exige `documento_url` HTTP(S), até 1.000 caracteres, e `mensagem` de 20–2.000 caracteres. Evidência, solicitante e BID são privados e imutáveis; rejeição preserva histórico e permite novo envio.
- Aprovação/rejeição é administrativa e os triggers sincronizam atomicamente `atletas.agent_id`/`claim_status`. Agente, clube e scraper nunca alteram vínculo ou status diretamente.
- Atleta já representado bloqueia novas solicitações. Troca futura de agente exige operação administrativa dedicada, com agente anterior/novo, justificativa, comprovante, administrador, data e histórico; nunca apagar o pedido anterior nem liberar `UPDATE` direto de `agent_id`.
- Estado live: migração `20260812170000_athlete_claim_flow.sql` aplicada. Após mudanças, execute `supabase/tests/athlete_claim_security.sql` e confirme `athlete_claim_security_passed`, rollback sem resíduos e Advisor sem erros/avisos.

## 🧪 Development Preview Accounts
- Existem duas contas reais e aprovadas para comparação de papéis pelo `/login`: `agente.teste@footbase.dev` (`2ec68d3e-4866-491f-ab00-88685fb771a7`) e `clube.teste@footbase.dev` (`17b0a608-bed3-4ae1-b712-b4191286b941`). O agente é verificado; o clube não possui linha em `agentes`.
- Nunca grave a senha dessas contas no código, Markdown, logs persistentes ou variáveis `NEXT_PUBLIC_*`. Se a senha for perdida/exposta, redefina-a pela Admin API server-side e informe o usuário fora do repositório.
- As contas usam o fluxo real, as mesmas RLS e os mesmos guards da produção. Não adicione bypass, seletor arbitrário de papel ou fallback mock ao login.
- Não vincule atleta ou clube real a essas contas apenas para demonstração. A remoção futura deve checar referências e mirar os UUIDs/e-mails exatos acima.
- Especificação: `docs/superpowers/specs/2026-08-12-dev-role-preview-accounts-design.md`.

## 🕷️ Scraping Compatibility Contract (obrigatório após o lançamento)
- Antes de alterar ou excluir qualquer função, tabela, coluna, view, RPC, trigger, constraint, relacionamento, enum ou permissão, produza uma análise curta: **consumidores atuais, impacto no scraper, compatibilidade, migração, backfill, teste e rollback**.
- Mudanças de UI, copy, i18n e apresentação são livres desde que não modifiquem o contrato de leitura/escrita. Mudanças de banco nunca são consideradas apenas "refatoração interna" enquanto o scraper ou a aplicação puderem consumi-las.
- Use sempre **expand/contract**: adicione a nova estrutura de forma compatível; atualize e valide scraper/aplicação; faça backfill; só depois descontinue a antiga em uma migração futura. Nunca renomeie/exclua diretamente uma dependência ativa.
- Prefira arquivamento lógico. Se `active`/`archived_at` ainda não existirem na entidade, crie-os por migração; não invente o campo apenas no código. Exclusão física precisa de autorização explícita, backup verificável e checagem de FKs/histórico.
- O scraper deve fazer upserts idempotentes por chaves estáveis: `atletas.bid`, `clubes.source_key` e identidade única da partida/súmula. Não altere essas chaves sem plano aprovado de migração dupla.
- `service_role` é segredo exclusivo do backend e deve continuar compatível com a ingestão. Nunca mova-o para `NEXT_PUBLIC_*`, cliente React, logs ou respostas HTTP.
- O scraper não pode escrever/sobrescrever dados governados por usuário/curadoria: `profiles.role`, `profiles.account_status`, `clubes.reivindicado_por`, `clubes.claim_status`, `atletas.agent_id`, `atletas.claim_status`, favoritos/notas, pranchetas/slots, solicitações de reivindicação, correções ou status/revisores.
- Toda release que tocar ingestão deve executar: backup; dry-run ou ambiente isolado; amostra de uma súmula real; testes de RLS/triggers; TypeScript/build; Advisor; e monitoramento posterior de `scraping_logs`. Se não houver dry-run implementado, a mudança permanece bloqueada para produção.
- Ao remover apenas uma funcionalidade da interface, mantenha temporariamente o contrato de banco consumido pelo scraper até confirmar que nenhum produtor/consumidor depende dele.

## 🔄 Automatic Context Maintenance
- Whenever a user asks to implement a screen or feature, check `PROJECT_STATE.md` first.
- After completing any task, update `PROJECT_STATE.md` by marking the task as completed in the roadmap and adding an entry to the Update Log section. Atualize também `PLANO_EXECUCAO_V3.md` quando a mudança afetar o roadmap ou uma fase registrada.
