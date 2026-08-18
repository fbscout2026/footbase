# 🏭 FOOTBASE — Runbook de Ingestão (Fase 6.5)

Checklist operacional que **libera a escrita live** do scraper. Enquanto qualquer item
abaixo não estiver satisfeito, a ingestão roda apenas em **dry-run** (a trava dura
recusa escrita). Este runbook é o "contrato de release" da ingestão.

## 🔒 Como a escrita live é travada

- `lib/services/scraper/ingestion-gate.ts` → `assertLiveIngestionAllowed()` **lança**
  a menos que `INGESTION_LIVE_ENABLED=true` esteja no **ambiente do servidor**
  (nunca `NEXT_PUBLIC_*`; fica ao lado de `SUPABASE_SERVICE_ROLE_KEY`).
- `ingestMatch(admin, parsed, { dryRun: false })` só escreve se: (a) o gate estiver
  habilitado **e** (b) a **reconciliação** passar. Caso contrário, retorna sem tocar
  o banco (o item vira `failed`/retry em `scraping_jobs`).
- `dryRun: true` valida + planeja + reconcilia **sem escrever** — sempre disponível.

## ✅ Gates obrigatórios antes de habilitar `INGESTION_LIVE_ENABLED`

1. **Backup verificável** do banco (snapshot Supabase) e plano de rollback por migração.
2. **Dry-run revisado** de uma amostra real por fonte: rodar `runCbfSumulaDryRun` e
   conferir o relatório (torneio/data/placar/clubes, `athletesSeeded`,
   `appearancesUpserted`, `skippedAppearances`) e **`reconciliation: []`**.
3. **Contrato aplicação↔scraper**: chaves estáveis intactas (`atletas.bid`,
   `clubes.source_key`, identidade única da partida/atuação); nenhum campo de
   **governança** no caminho de escrita (posse, `agent_id`, favoritos, correções,
   decisões admin). Precedência: fonte fornece → vence; ausente → preserva.
4. **RLS/Advisor**: `scraping_infra_security.sql` passa; Advisor sem erros; leitura
   das tabelas de ingestão continua admin-only.
5. **TypeScript + testes**: `npx tsc --noEmit` limpo e `npm run test:scraper` verde.
6. **Isolamento**: rodar primeiro numa fonte/competição pequena; monitorar
   `scraping_logs` (status/records/erros) e `scraping_jobs` (pendências) no `/admin`.

## 🔁 Operação recorrente (após liberar)

- Agendado **2×/semana** (2ª e 5ª), off-peak, **incremental** e **idempotente**.
- Falha por item → `scraping_jobs` (`pending/done/failed`+tentativas): pula e retenta
  no próximo run. Persistentes aparecem no monitor `/admin`.
- **Reconciliação** (`reconciliation.ts`) barra parse degradado / mudança de layout
  **antes de escrever** — nunca sobrescreve dado bom com lixo.
- Falha de scrape **não derruba a exposição** (UI lê só do Postgres).

## 🧩 Peças implementadas (6.2–6.5) — fonte CBF

- Parsers puros: `parse-cbf-sumula.ts` (cabeçalho/placar/roster), `parse-cbf-events.ts`
  (gols/cartões/subs → atuações), `parse-cbf-registry.ts` (clubes/atletas, **CPF
  descartado**).
- Núcleo: `types.ts`, `validate.ts`, `reconciliation.ts`, `ingest.ts` (idempotente,
  precedência/coalesce, gate + reconciliação), `ingestion-gate.ts`.
- Identidade/semente: `resolve-athlete-identity.ts` (perfil único por BID),
  `plan-registry-seed.ts` (planejador FK-safe + backfill de nascimento).
- IO: `extract-pdf-text.ts` (`fetch`+`pdf-parse`), `run-cbf-sumula-dryrun.ts` (runner).
- Infra live: tabelas `scraping_jobs`, `atleta_fontes`; `categoria_ordem` SUB-11..SUB-20;
  `atletas.birth_date` nullable (backfill).

## 🧩 Peças implementadas — fonte FPF (Federação Paulista, Sessions 38-39)

Segunda fonte real, prova do desenho "núcleo único + um adaptador por fonte" — todos os
parsers abaixo são puros e testados com dados reais capturados ao vivo (não amostras
inventadas):

- `parse-fpf-atletas.ts` — elenco por clube (`Handlers/Atleta/ListarAtletas.ashx`):
  nome, nascimento, clube. Identidade é o `IdAtleta` interno da FPF, não o BID da CBF.
- `parse-fpf-sumula.ts` + `parse-fpf-events.ts` — súmula em PDF
  (`conteudo.fpf.org.br/sumulas/{ano}/{idCampeonato}/{idJogo}.pdf`, confirmado **sem**
  proteção Cloudflare mesmo o site principal tendo — mesmo padrão da CBF: só a
  descoberta via `Handlers/Competicoes/ListarTabela.ashx` precisa de Playwright).
  Identidade é o "Registro" federativo do jogador (ex. `656616/26`). **Diferença
  importante da CBF:** o minuto do evento já é absoluto (não soma +45 no 2º tempo).
  **Limitação:** sem marcador de goleiro → `clean_sheet` sempre `false`.
- `parse-fpf-athlete-profile.ts` — perfil individual (`Handlers/Atleta/ReadAtleta.ashx`):
  nascimento, idade, nacionalidade, fim de contrato (mapeia pra
  `atletas.contract_end_date`, já existente). **Crosswalk confirmado ao vivo:** o
  `Registro` deste endpoint é o mesmo da súmula, só sem o sufixo `/{ano}`.
- `plan-fpf-identity-seed.ts` — planejador: **nunca cria atleta novo** (a fonte não
  carrega um BID real da CBF); só propõe backfill de nascimento (preenche lacuna, nunca
  sobrescreve) e refresh de nacionalidade/contrato (fonte vence, podem legitimamente
  mudar); qualquer candidato sem correspondência vai para revisão do admin.
- Mapeamento `IdCampeonato`/`IdCategoria` por categoria de base confirmado ao vivo:
  SUB-11=125/80, SUB-12=203/91, SUB-13=127/81, SUB-14=202/90, SUB-15=32/17, SUB-17=33/18,
  SUB-20 Série A=221/94, SUB-20 Série B=219/93.

Mesmos gates de release deste runbook se aplicam antes de qualquer escrita live desta
fonte também — nenhuma exceção por ser uma fonte "menor".

## 🧩 Peças implementadas — descoberta CBF "Tabela Detalhada" (Session 40)

A CBF não tem API JSON como a FPF (site é Next.js/RSC) — mas cada competição nacional
publica um PDF "Tabela Detalhada" (temporada inteira) hospedado fora do Next.js
(`stcbfsiteprdimgbrs.blob.core.windows.net`), **sem Cloudflare**, `fetch` simples
funciona:

- `parse-cbf-tabela-detalhada.ts` — parser puro, âncora no padrão de data (`DD/MM`+dia
  da semana, único token inequívoco no texto colado do PDF) em vez de posição fixa de
  coluna. **75 de 77 jogos reais da amostra (SUB-20 Série A) parseados corretamente**
  — os 2 restantes são finais futuras sem placar ainda, não é falha do parser.
- **7 competições nacionais de base 2026 mapeadas** (link do PDF de cada uma) em
  `__fixtures__/cbf-2026-competicoes-base-descoberta.json`: Brasileirão SUB-20 Série
  A/B, Brasileirão SUB-17, Copa do Brasil SUB-17/SUB-15, Copa do Nordeste SUB-20, Liga
  de Desenvolvimento SUB-13. Copa do Brasil SUB-20 e as duas Supercopas do Brasil não
  têm edição 2026 confirmada (parecem sem edição neste ano ou descontinuadas).
- **Isto é um índice de DESCOBERTA, não fonte de `ParsedMatch`** — não tem escalação,
  gols, cartões, nem o link da súmula em si.
- **Crosswalk `jogo`↔`código da súmula` testado ao vivo e REFUTADO como fórmula geral**
  (Session 40): para o jogo 183 (rodada 19), o código real é `5642183` — bate com
  "prefixo 5642 + jogo (3 dígitos)". O mesmo padrão funcionou pro jogo 198 (fase
  final). **Mas falhou pros jogos 001 e 004 (rodada 1)** — `5642001`/`5642004`
  devolveram 404, apesar de esses jogos já terem sido disputados há meses. Conclusão:
  o código da súmula é algo como um **ID sequencial interno da CBF atribuído na
  publicação**, não uma função aritmética do número do jogo — bateu por coincidência
  pros dois casos testados que ficavam "próximos". **Não dá pra construir a URL da
  súmula a partir da Tabela Detalhada sem uma descoberta de verdade** (Playwright
  navegando a página de cada jogo, ou outro endpoint ainda não achado que exponha o
  link direto). Isso bloqueia o uso do índice da CBF pra achar súmulas automaticamente
  — diferente da FPF, onde a API já entrega o link pronto.
- Só a SUB-20 Série A teve extração jogo-a-jogo validada; as outras 6 competições
  podem ter variações de formato ainda não vistas.

## 🚀 O executor (Session 41) — como rodar

```bash
npx playwright install chromium   # uma vez, na máquina que vai rodar isso (VPS)
npm run ingest:dry-run            # dry-run por padrão — nunca escreve
```

`lib/services/scraper/run-live-ingestion.ts` é o script standalone (não é rota do
Next.js) que finalmente junta tudo: descobre (Playwright), baixa cada súmula
(`fetch` simples — confirmado sem bloqueio pros domínios de PDF de ambas as fontes),
extrai, faz o parse, reconcilia e — só com `INGESTION_LIVE_ENABLED=true` — grava,
usando o mesmo `ingestMatch` de sempre.

- **`lib/services/scraper/rate-limit.ts`** — todo loop de rede passa por
  `forEachRateLimited`: sequencial (nunca paralelo), ~700-1000ms + jitter entre
  requisições, e uma falha isolada nunca aborta o lote inteiro. 5 testes.
- **`lib/services/scraper/discovery/fpf-discover.ts`** — Playwright clicando no
  seletor de rodada de verdade (não fetch injetado) e capturando a resposta que o
  jQuery da própria página gera. **Bloqueada (Session 44) — ver atualização abaixo.**
- **`lib/services/scraper/discovery/cbf-discover.ts`** — **reescrito na Session 44,
  fetch puro, sem Playwright.** Ver seção própria abaixo.
- **`lib/services/scraper/fpf-to-parsed-match.ts`** — resolve o `registro` de cada
  jogador pra um `bid` real via `atleta_fontes` (nunca cria mapeamento novo aqui — só
  usa o que já foi confirmado pelo pipeline de elenco/perfil) e monta um `ParsedMatch`
  que o `ingestMatch` já sabe consumir, sem duplicar lógica.
- **Config inicial:** 9 categorias da FPF (mapeadas, mas pendentes por ora — ver nota
  abaixo) + 7 competições nacionais da CBF (todas validadas ponta a ponta, Session
  44) — adicionar uma federação nova é só adicionar uma entrada na config, o loop do
  executor não muda.

**⚠️ Atualização (Session 43) — primeira execução real, 2 bugs reais achados:**
instalei o Chromium e tentei rodar de verdade pela primeira vez. Como previsto, isso
expôs bugs que `tsc`/testes não pegam:
1. **`server-only` nunca foi instalado como pacote de verdade** e, uma vez instalado,
   o pacote real lança erro fora do bundler do Next.js — removido dos arquivos que o
   executor importa diretamente (`ingest.ts`, `ingestion-gate.ts`,
   `extract-pdf-text.ts`, `fpf-to-parsed-match.ts`, `discovery/*.ts`); seguro porque
   esses arquivos já não empacotariam pro navegador de qualquer forma.
2. **Imports relativos sem extensão `.ts`** em vários arquivos pré-existentes do
   scraper (bug antigo, nunca pego porque nenhum teste roda `ingest.ts` fora do
   Next.js) — corrigido em todos.

Isso confirma a lição: `tsc`/testes garantem que o código está *correto*, não que ele
*roda* fora do processo de build do Next.js. A primeira execução real de qualquer
código novo deste executor deve ser tratada como teste, não como formalidade.

Depois desses 2, mais 2 bugs em `discovery/fpf-discover.ts`, corrigidos em sequência:
3. `page.evaluate(() => fetch(...))` falhava porque a página nunca tinha navegado pra
   `futebolpaulista.com.br` antes (origem `about:blank` bloqueia fetch cross-origin).
   Corrigido com `ensureFpfOrigin(page)`.
4. Mesmo depois de navegar, a resposta vinha em HTML — a página fica presa em
   "Just a moment..." (Cloudflare). Debug confirmou: **a Cloudflare bloqueia o
   Chromium headless padrão do Playwright especificamente.**

**🚧 FPF (Session 44):** ingestão fica **pendente/pausada** por ora. Retomar assim que
houver acesso oficial/API autorizada pela federação. O mecanismo de discovery em
`lib/services/scraper/discovery/fpf-discover.ts` já está implementado.

**✅ CBF — reescrita sem Playwright (Session 44), achado grande:** `cbf.com.br` **não
tem bot-detection nenhum** — confirmado com `curl` puro, sem navegador, sem cookies.
Duas leituras diferentes conforme o formato da fase:
1. **Fase de grupo/rodadas** (ex: "1ª Fase" do Brasileirão SUB-20): o HTML inicial da
   página de tabela já embute `competitionId` e a contagem de rodadas
   (`"current":19,"total":19`, dentro de um payload RSC do Next.js — string JS
   com aspas escapadas, não JSON parseável direto, por isso regex tolerante a
   `\"`). Cada rodada vem de `GET /api/cbf/jogos/campeonato/{id}/rodada/{n}/fase` —
   **API pública sem autenticação** que devolve todos os jogos da rodada **com
   escalação completa dos dois times, substituições, árbitros, gols/cartões E os 3
   links de documentos (Súmula/Boletim/Relatório)** — mais rico que o que a gente
   tirava do PDF.
2. **Fase de mata-mata** (Quartas/Semi/Final, ida-e-volta): não tem contagem de
   rodada nem chamada de API separada — os jogos (mesmo formato de dado) já vêm
   embutidos direto no HTML da própria página de tabela, dentro do mesmo payload RSC.
   Extraídos decodificando cada chunk `self.__next_f.push([n,"..."])` (é uma string
   JS escapada, não um documento JSON — decodificada com `JSON.parse('"'+chunk+'"')`)
   e depois casando chaves `{}` (respeitando aspas) a partir de cada `"id_jogo":`
   encontrado no texto decodificado.

`discoverCbfMatchesForPhase(tabelaPhaseUrl)` detecta sozinho qual dos dois formatos a
URL é e lê do jeito certo — o chamador não precisa saber a diferença. `run-live-ingestion.ts`
não passa mais `page` (Playwright) pra `processCbfSource` — só a FPF ainda usa o
navegador. Cada fonte (FPF e CBF) agora roda isolada em try/catch no loop principal do
executor — uma fonte quebrada (como a FPF hoje) nunca impede as outras de rodar.

**Mapa completo das competições nacionais masculinas de base com dados ativos em
2026** (testado ao vivo, ponta a ponta — **596 jogos, 502 com súmula, zero erros**):

| Competição | Fases (`idFase`) |
|---|---|
| Brasileirão SUB-20 | 2008 (1ªFase/grupos), 2070 (Quartas), 2076 (Semi), 2087 (Final) |
| Brasileirão SUB-20 B | 2063, 2067, 2073 |
| Brasileirão SUB-17 | fase única (grupos, URL base sem `idFase`) |
| Copa do Brasil SUB-17 | 2006, 2014, 2032, 2056, 2062 |
| Copa do Brasil SUB-15 | 2045, 2057, 2072, 2079, 2081, 2082 |
| Copa do Nordeste SUB-20 | fase única (grupos, URL base sem `idFase`) |
| Liga de Desenvolvimento SUB-13 Masc. | 2029, 2036, 2041 (slug real `sub-13-masculino`, diferente do texto do menu) |

Copa do Brasil SUB-20 e Supercopa do Brasil SUB-20/SUB-17 existem no menu de
competições mas não têm dados 2026 ainda (página de tabela vazia, confirmado ao vivo)
— não incluídas até terem edição ativa. Feminino fora de escopo (decisão prévia).

## ✅ Dry-run completo rodado de ponta a ponta (Session 44) — 3 bugs reais achados no parser

Rodar o discovery contra ~500 súmulas reais das 7 competições (não só uma amostra)
expôs 3 bugs no `parse-cbf-sumula.ts`/`parse-cbf-events.ts` que o fixture de teste
nunca pegava porque não cobria esses casos:

1. **`pdf-parse` às vezes não insere espaço entre colunas adjacentes da tabela**
   (ex.: `NºApelidoNome CompletoT/RP/ACBF`, `1Gabriel We ...Gabriel Laizo WerneckT(g)P718455`).
   Os regexes assumiam `\s+` entre colunas — trocado por `\s*` em todo o parser de
   escalação. O marcador real de goleiro é `(g)` colado no `T`/`R` (ex. `T(g)`), não
   `g\` como o código assumia originalmente (possivelmente uma versão antiga do
   `pdf-parse` renderizava diferente).
2. **Gol contra ("Contra") corretamente não é creditado a nenhum jogador** (convenção
   de futebol — não é "gol dele"), mas conta no placar final — então a soma dos gols
   pessoais dos jogadores nunca batia com o placar sempre que havia gol contra.
   `ParsedMatch` ganhou o campo opcional `ownGoals` (também propagado pro lado da FPF,
   mesmo pausada, pra não deixar o mesmo bug latente lá — `parse-fpf-events.ts` tinha
   exatamente a mesma lógica de exclusão), e `reconciliation.ts`/`reconciliation-fpf.ts`
   passaram a somar `appearances.goals + ownGoals` contra o placar.
3. **Substituição feita no intervalo (meio de campo) usa `-` no lugar do horário e
   `INT` no lugar de `1T`/`2T`** (mesmo conceito que a FPF já tinha) — sem isso, o
   jogador entrava em campo "invisível" pro sistema (nunca marcado como "jogou"),
   perdendo qualquer gol/cartão que tivesse. Além disso, **nomes de clube longos
   truncam com "..." na seção de Substituições**, cortando o "/UF" que o token de
   time original exigia — o token passou a ser ancorado num **prefixo curto do nome**
   (8 caracteres, sobrevive a qualquer truncamento observado) em vez do nome completo
   ou de um padrão genérico `\S+\/[A-Z]{2}`.

Fixture `__fixtures__/sumula-5642183.txt` foi atualizado pra refletir o texto
realmente extraído hoje (o antigo tinha espaços que a extração ao vivo não tem —
provavelmente captado com uma versão diferente do `pdf-parse`).

**Resultado final, testado ao vivo:** `npm run ingest:dry-run` (7 competições, ~500
súmulas reais) → **499 de 500 jogos ingeridos**, **1 caso residual que não é bug**
(súmula com todos os horários zerados e sem seção de Gols — parece um resultado
administrativo/W.O. sem dados de jogo — corretamente barrado pela reconciliação para
revisão admin, comportamento esperado). `tsc` limpo, `test:scraper` 83/83.

## ⏳ Pendências para operação plena

- **FPF pendente** — retomar quando houver acesso oficial da federação.
- **Fila `scraping_jobs` ainda não está integrada ao executor** — hoje ele roda tudo
  numa passada só e imprime um resumo no console; enfileirar/retentar falhas
  individualmente via `scraping_jobs` (como o restante do produto já faz) é o próximo
  refinamento antes de rodar sem supervisão.
- ~~Confirmar o crosswalk `jogo`↔`código da súmula` na CBF~~ — **resolvido (Session
  44):** ficou sem efeito prático — a API `/api/cbf/jogos/campeonato/{id}/rodada/{n}/fase`
  já devolve o link da súmula pronto (`documentos[].url`) pra cada jogo, não precisa
  mais construir/adivinhar o código nem navegar página por página.
- ~~Requisito de Playwright pro executor da CBF~~ — **superado (Session 44):** a
  descoberta antiga (Playwright navegando cada página de jogo + clique em
  "Documentos") funcionava, mas foi substituída por fetch puro — ver seção própria
  acima. `idJogoGrande` continua vindo do campo `id_jogo` da API, sem precisar de
  índice de links separado.
- ~~Reconciliação equivalente à `reconciliation.ts` para a FPF~~ — **feita** (Session
  41): `reconciliation-fpf.ts`, mesmas checagens (gols batem com o placar, escalação
  não vazia/absurda, sem assistências inesperadas) + uma checagem própria da FPF
  (nenhuma atuação sem `registro`). **Deliberadamente NÃO** sinaliza `clean_sheet:
  false` como erro — é uma limitação aceita da fonte (súmula da FPF não marca goleiro),
  não uma falha de parse. **Ainda falta:** o mesmo para o índice "Tabela Detalhada" da
  CBF (mas esse índice sozinho não tem dados de partida pra reconciliar — só faz
  sentido depois que a extração jogo-a-jogo da súmula da CBF via Playwright existir).
- **Executor live do plano de registro** (clubes/atletas/mapa + escudo→webp via
  `lib/club-crest.ts`) — sob os gates acima.
- **`birth_date` backfill (CBF)**: fonte ainda em aberto (`bid.cbf.com.br`/perfil legado
  é protegido por CAPTCHA, descartado; ou curadoria admin). Não bloqueia (perfil já é
  criado sem a data). Para a FPF isso já está resolvido (`parse-fpf-athlete-profile.ts`).
- **Classificação/tabelas calculadas** a partir dos resultados ingeridos.
- **Casos reais não vistos ainda na FPF:** gol de pênalti/contra/falta, cartão vermelho
  — o parser tem a lógica (mesmos códigos NR/PN/CT/FT da legenda), mas nunca foi
  validado contra uma linha real desses tipos.
- **Futebol feminino:** fora de escopo por decisão explícita do usuário (Session 40),
  não retomar sem pedido novo.
- **Quarta fonte em diante** (FERJ, FGF, ...): cada uma exige a mesma investigação ao
  vivo feita para a FPF/CBF — não existe um sistema único entre federações.
