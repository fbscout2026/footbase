# FOOTBASE — Design da comparação de atletas (Fase 3.5)

## Objetivo

Permitir que um usuário aprovado selecione dois ou três atletas e compare, lado a lado, dados biográficos, físicos e de desempenho. A tela deve destacar a melhor célula de cada métrica sem perder a linguagem visual densa, full-width e responsiva do FOOTBASE.

## Abordagem escolhida

A seleção será controlada pelo parâmetro `bids` da URL, por exemplo `/atletas/comparar?bids=123,456`. Isso torna a comparação compartilhável, preserva o estado após recarregar e evita estado global ou persistência prematura no Supabase.

Alternativas descartadas:

- Estado apenas local: implementação menor, mas a comparação se perde ao recarregar ou compartilhar.
- Persistência no Supabase: permitiria comparações salvas, mas amplia o escopo e exige schema, RLS e interface de gerenciamento sem necessidade no UC05.

## Arquitetura e componentes

- `app/(app)/atletas/comparar/page.tsx`: rota client-side, lê e atualiza `bids` com a navegação do Next.js e resolve os atletas a partir de `mockAtletas`.
- `components/atletas/comparar/AtletaCompareSelector.tsx`: três slots de seleção, bloqueia duplicidades e exige entre dois e três atletas para exibir a matriz completa.
- `components/atletas/comparar/AtletaComparisonMatrix.tsx`: renderiza cabeçalhos dos atletas e linhas de comparação a partir de uma definição declarativa de métricas.
- `lib/atleta-comparison.ts`: concentra parsing/normalização de BIDs, definição das métricas e cálculo dos vencedores. Essa camada não conhece React e pode ser verificada isoladamente.

A listagem de atletas e o dossiê ganharão CTAs para iniciar ou continuar uma comparação. Nenhuma tabela ou migração será adicionada.

## Dados e métricas

A matriz terá grupos:

- Perfil: posição, idade, categoria, clube, altura, peso, pé dominante e nacionalidade.
- Desempenho: jogos, minutos, gols, assistências, participações em gols, minutos por jogo, cartões, suspensões e jogos acima da categoria.
- Especial: clean sheets apenas para goleiros e índice evolutivo atual calculado por `getEvolucao`.

As métricas comparáveis serão declaradas como `higher` ou `lower`. Valores maiores vencem nas métricas positivas; valores menores vencem em cartões e suspensões. Empates destacam todos os líderes. Valores ausentes ou não aplicáveis não competem. Dados descritivos não recebem destaque.

## Comportamento e estados de erro

- A URL aceitará somente BIDs existentes, únicos e limitará a seleção aos três primeiros válidos.
- Com menos de dois atletas, a tela mostrará orientação e manterá o seletor utilizável.
- Selecionar um atleta já usado será impedido no seletor.
- Remover ou trocar um atleta atualizará a URL sem recarregar a aplicação.
- Em telas estreitas, a matriz usará rolagem horizontal, preservando a primeira coluna de métricas como referência visual.
- A rota estática `/atletas/comparar` coexistirá com `/atletas/[bid]`; o roteamento do Next.js prioriza o segmento estático.

## Visual e acessibilidade

- Usar apenas tokens de `app/globals.css`; o destaque vencedor usa `brand` (`#4CBB17`) por meio das classes semânticas existentes.
- Cabeçalhos mantêm escudo do clube, nome, BID, posição e categoria; não há fotos de jogadores.
- Controles possuem rótulos, estados de foco e botões com nomes acessíveis.
- Todas as strings entram em `lib/i18n/dictionaries.ts` nos idiomas PT, EN e ES.

## Pontos de entrada

- `/atletas`: botão principal “Comparar atletas” abre o seletor vazio.
- `/atletas/[bid]`: botão “Comparar” abre a rota com o atleta atual já selecionado.
- A tela de comparação oferece retorno à busca e links para os dossiês.

## Validação

- Verificar parsing de URLs com BIDs inválidos, repetidos e mais de três valores.
- Verificar líderes únicos, empates, regra de menor valor e valores não aplicáveis.
- Executar `tsc --noEmit` e `npm run build`.
- Validar no navegador seleção/troca/remoção, URL, links, PT/EN/ES, dark/Estádio e larguras de desktop e tablet.

## Fora do escopo

- Comparações salvas, compartilhamento com permissões próprias ou persistência no Supabase.
- Normalização estatística por posição/categoria e score preditivo novo.
- Integração com dados reais; a troca de `mockAtletas` por consulta será feita quando o projeto abandonar o fluxo mock-first.
