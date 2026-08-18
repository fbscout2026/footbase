# FOOTBASE — Favoritos e Prancheta Tática com Supabase (Fase 3.6)

## Objetivo

Entregar uma shortlist privada e persistente por usuário e uma prancheta tática capaz de montar automaticamente o melhor XI entre os atletas favoritados. A montagem deve respeitar a formação, comparar desempenho por função e permitir ajustes manuais sem ser sobrescrita silenciosamente pelo futuro scraper.

## Decisões aprovadas

- Persistência real no Supabase desde esta fase.
- Uma prancheta por usuário, criada no primeiro acesso.
- Somente atletas favoritados podem ocupar o XI ou o banco.
- Montagem híbrida: o sistema sugere o melhor XI e o usuário pode substituir atletas.
- Formações: `4-3-3`, `4-4-2`, `3-5-2` e `4-2-3-1`.
- O banco contém favoritos não escalados e é ordenado pela nota do usuário.
- O scraper atualiza dados institucionais e desempenho, mas nunca altera automaticamente favoritos ou escalações pessoais.

Alternativas descartadas:

- Montagem apenas automática: reduz o controle do scout.
- Montagem apenas manual: não aproveita a inteligência comparativa já construída.
- Persistência local: não atende à decisão de manter shortlist e prancheta entre dispositivos e sessões.

## Estado atual e pré-requisito de dados

A tabela live `atletas` está vazia. Como `favoritos.bid_atleta` e `prancheta_slots.bid_atleta` possuem chaves estrangeiras, a migração desta fase deve semear os cinco clubes e dezenove atletas atuais antes de ativar as escritas da interface.

O seed é um bootstrap, não uma fonte paralela permanente. Atletas serão identificados pelo BID e atualizados posteriormente por `upsert`. Clubes precisam de uma identidade externa estável para impedir duplicação durante a ingestão.

Nesta fase, dados biográficos e desempenho continuam vindo de `lib/mock-data.ts`, conforme o contrato mock-first da Fase 3. Favoritos, notas, observações, prancheta e slots vêm do Supabase. Na Fase 6, o adaptador de desempenho troca o mock por `view_atleta_resumo` sem alterar componentes ou algoritmo.

## Migração da Fase 3.6

Criar uma migração Supabase com timestamp em `supabase/migrations/` e espelhar o resultado em `supabase/schema.sql`.

### Identidade e integridade

- Adicionar `clubes.source_key text` e índice único parcial para valores não nulos. Formato: `<fonte>:<id>`, por exemplo `cbf:1234`; seeds internos usam `seed:<slug>` até o scraper descobrir uma identidade oficial.
- Criar restrição única em `prancheta_tatica(user_id)` para garantir uma única prancheta por usuário.
- Restringir `prancheta_tatica.formation` às quatro formações suportadas.
- Restringir `prancheta_slots.position_code` aos códigos válidos de posição quando `slot_type = 'starter'`, exigindo `null` para banco.
- Manter as unicidades já existentes por atleta e por posição/ordem dentro da prancheta.

### RLS

- Recriar políticas de `favoritos`, `prancheta_tatica` e `prancheta_slots` com `TO authenticated`.
- Usar `(select auth.uid())` nas verificações de posse.
- `favoritos`: proprietário aprovado pode selecionar, inserir, atualizar e excluir apenas suas linhas.
- `prancheta_tatica`: proprietário aprovado pode acessar apenas sua prancheta.
- `prancheta_slots`: posse deriva da prancheta pai; `WITH CHECK` também exige que o BID esteja nos favoritos do mesmo proprietário.
- Administradores mantêm acesso via `private.is_admin()`.

### Operação atômica da escalação

Criar uma função RPC transacional `replace_prancheta_slots(board_id uuid, formation text, slots jsonb)` com segurança do invocador, `search_path` fixo e execução concedida somente a `authenticated`. A função:

1. confirma que a prancheta pertence a `(select auth.uid())`;
2. valida no máximo onze titulares e um conjunto sem BIDs repetidos;
3. confirma que todos os BIDs são favoritos do proprietário;
4. remove os slots antigos e insere o novo conjunto na mesma transação;
5. deixa constraints e RLS como segunda camada de proteção.

Persistir somente titulares em `prancheta_slots`. O banco é sempre derivado dos favoritos que não estão no XI, evitando duplicar shortlist e ordem ranqueada no banco.

Criar também `remove_favorite_and_slot(bid bigint)` com segurança do invocador e grants equivalentes. Ela remove o atleta dos slots da prancheta do usuário e depois exclui o favorito na mesma transação, impedindo slot órfão da shortlist.

Não usar `service_role` no frontend nem `SECURITY DEFINER` para contornar RLS.

### Seed

- Inserir cinco clubes com IDs gerados pelo banco e `source_key = seed:<slug>`, somente quando não existir correspondência exata por nome normalizado + estado + federação; isso evita recriar o bootstrap após a promoção para uma identidade oficial.
- Inserir os dezenove atletas atuais pelo BID, resolvendo os clubes por `source_key`; em conflito, preservar a linha já existente para não sobrescrever dados posteriores do scraper.
- Não semear favoritos ou pranchetas, pois são dados privados por usuário.
- O futuro scraper fará `upsert` de atleta por BID e de clube por `source_key`, preservando as referências existentes. Para os cinco clubes bootstrap, uma correspondência exata por nome normalizado + estado/federação substitui `seed:<slug>` pela primeira identidade oficial; correspondência ambígua gera log para revisão e não cria duplicata silenciosamente.

## Arquitetura da aplicação

### Acesso a dados

- `lib/services/favorites.ts`: listar, favoritar por `upsert(user_id,bid_atleta)`, atualizar nota/observação e desfavoritar.
- `lib/services/tactical-board.ts`: obter/criar a prancheta do usuário, atualizar nome/formação e substituir slots pela RPC.
- `lib/prancheta-ranking.ts`: funções puras para compatibilidade posicional, pontuação, desempate e montagem do XI.
- `lib/prancheta-formations.ts`: definição dos onze slots e coordenadas de cada formação.

O cliente Supabase usa a sessão autenticada e a chave pública. O `user_id` enviado nunca é fonte de autorização; a RLS valida a identidade real da sessão.

### Estado compartilhado de favoritos

Adicionar `FavoritesProvider` ao layout autenticado. Ele recebe os favoritos iniciais carregados no servidor e oferece:

- consulta por BID;
- estado otimista para favoritar/desfavoritar;
- atualização de nota e observação;
- rollback e mensagem traduzida em caso de erro.

Isso mantém busca, dossiê, dashboard e prancheta sincronizados durante a sessão.

## Interface de favoritos

### Busca `/atletas`

- Adicionar coluna/controle de coração em cada linha.
- O clique não navega para o dossiê.
- Favoritar abre um painel compacto para nota `0–100` e observação opcional; valor inicial sugerido `50`, editável antes de salvar.
- Atleta favoritado mostra coração preenchido e permite editar nota/observação ou remover.

### Dossiê `/atletas/[bid]`

- Exibir o mesmo controle com nota atual e observação.
- Reutilizar o mesmo formulário/componente, sem lógica de persistência duplicada.

## Interface da prancheta `/prancheta`

### Estrutura

- Cabeçalho com nome da prancheta, formação, contagem de favoritos e ação “Atualizar melhor XI”.
- Gramado SVG responsivo com onze slots posicionados pelas coordenadas da formação.
- Cada atleta mostra nome curto, posição, escudo e score objetivo.
- Painel lateral de banco com nota do usuário, score e indicadores de mercado.
- Toggle dark/Modo Estádio usa o tema global existente; não cria um tema paralelo.

### Estados

- Sem favoritos: orientação e CTA para `/atletas`.
- Menos de onze candidatos: preencher o máximo possível e mostrar posições vagas.
- Favoritos suficientes, mas incompatíveis: não forçar atleta fora de função; manter slot vazio.
- Falha de leitura: mensagem com tentar novamente.
- Falha de gravação: rollback do estado otimista e preservação da última escalação confirmada.

### Ajustes manuais

Ao selecionar um slot, abrir uma lista de favoritos compatíveis ainda não escalados, ordenados pelo score daquela função. Posição principal é compatibilidade plena; posição secundária recebe fator `0,92`. O usuário pode limpar o slot. Toda alteração salva a escalação completa pela RPC atômica.

Trocar a formação executa nova montagem automática após confirmação caso existam ajustes manuais. Atualizações do scraper não disparam remontagem. O usuário precisa clicar em “Atualizar melhor XI”.

## Algoritmo de desempenho

Todas as métricas numéricas são normalizadas de `0–1` dentro do conjunto de favoritos elegíveis para o slot. Ausência de dados vale `0`, nunca vence por acidente. O score final é limitado a `0–100`.

### Goleiro (`GK`)

- índice evolutivo: 35%;
- clean sheets por jogo: 35%;
- minutos por jogo: 20%;
- jogos acima da categoria: 10%;
- penalidade disciplinar: até 10 pontos.

### Defensores (`CB`, `LB`, `RB`)

- índice evolutivo: 40%;
- minutos por jogo: 25%;
- volume de jogos: 15%;
- jogos acima da categoria: 20%;
- penalidade disciplinar: até 15 pontos.

### Meias (`DM`, `CM`, `AM`)

- índice evolutivo: 35%;
- assistências por 90 minutos: 25%;
- participações em gol por 90: 20%;
- minutos por jogo: 10%;
- jogos acima da categoria: 10%;
- penalidade disciplinar: até 12 pontos.

### Atacantes (`LW`, `RW`, `ST`)

- índice evolutivo: 35%;
- gols por 90 minutos: 30%;
- participações em gol por 90: 20%;
- assistências por 90: 5%;
- jogos acima da categoria: 10%;
- penalidade disciplinar: até 12 pontos.

Aplicar fator `0,92` ao score quando o atleta entra por posição secundária. Desempates seguem: score objetivo, nota do favorito, mais minutos e menor BID para resultado determinístico. A nota do usuário nunca substitui o desempenho; serve somente como desempate e ranking do banco.

## Formações

- `4-3-3`: GK · RB · CB · CB · LB · DM · CM · CM · RW · ST · LW.
- `4-4-2`: GK · RB · CB · CB · LB · RM/RW · CM · CM · LM/LW · ST · ST.
- `3-5-2`: GK · CB · CB · CB · RM/RW · DM · CM · AM · LM/LW · ST · ST.
- `4-2-3-1`: GK · RB · CB · CB · LB · DM · DM/CM · RW · AM · LW · ST.

Quando um slot admite dois códigos, o primeiro é preferencial e o segundo é compatível sem penalidade adicional além da regra de posição secundária.

## Integração com o scraping

- O scraper nunca apaga atletas como rotina; atualiza por BID e registra ausência/inatividade separadamente quando essa função existir.
- Clubes são resolvidos primeiro por `source_key`. Para seeds, um único match exato por nome normalizado + estado/federação vincula a identidade oficial; resultados ambíguos geram erro em `scraping_logs` e exigem revisão antes de criar outro clube.
- Partidas e atuações continuam usando as constraints naturais já existentes.
- Após a Fase 6, `getPerformanceSource()` passa a ler `view_atleta_resumo`; o algoritmo e a UI permanecem inalterados.

## Testes e verificação

### Automatizados

- Cada formação produz exatamente onze slots únicos.
- Nenhum atleta ocupa dois slots.
- Apenas favoritos são elegíveis.
- Posição principal vence posição secundária quando scores brutos empatam.
- Pesos por grupo, penalidade disciplinar, normalização e desempates.
- Escalação parcial quando faltam candidatos.
- Banco exclui titulares e ordena por nota.

### Supabase

- Usuário A não lê nem altera favoritos/prancheta do usuário B.
- Favoritar, editar e desfavoritar persistem após reload.
- Slot com atleta não favorito é rejeitado.
- Troca completa de formação é atômica.
- Seed pode rodar novamente sem duplicar clubes ou atletas.
- Executar Advisors após a migração e confirmar grants/Data API.

### Aplicação

- TypeScript e build de produção.
- Fluxos em PT/EN/ES.
- Desktop, notebook e tablet; rolagem/painéis sem cortar o gramado.
- Dark e Modo Estádio.

## Fora do escopo

- Várias pranchetas por usuário.
- Arrastar livremente atletas para coordenadas arbitrárias.
- Compartilhamento público ou colaboração em tempo real.
- Remontagem automática após cada execução do scraper.
- Substituição geral das demais telas mock pela fonte Supabase; isso ocorre junto à ingestão na Fase 6.

## Referências verificadas

- Supabase JavaScript `upsert`: https://supabase.com/docs/reference/javascript/upsert
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Changelog de breaking changes: https://supabase.com/changelog?types=breaking-change
