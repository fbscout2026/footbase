# FOOTBASE — Redesign Matchday Premium

## Objetivo

Elevar a landing page e toda a área interna a um padrão visual mais profissional, esportivo e coerente com a marca FOOTBASE. A reformulação é exclusivamente visual: preserva exatamente a organização, ordem, conteúdo, rotas e comportamento atuais.

## Decisões aprovadas

- Direção visual: **Matchday Premium**.
- Paleta oficial exclusiva: Verde Campo `#4CBB17` (`76 187 23`), Grafite Escuro `#121212` (`18 18 18`) e Branco Puro `#FFFFFF` (`255 255 255`). Transparências desses tons podem criar bordas, hovers, sombras e profundidade.
- Manter alternância entre tema claro e escuro.
- Manter exatamente a organização atual da landing e do sistema interno.
- Cabeçalhos superiores da landing e do sistema interno usam Grafite Escuro `#121212` fixo nos dois temas, sem gradiente e sem mudança de cor.
- A logo clara oficial é usada nos dois cabeçalhos superiores, tanto na landing quanto no sistema interno.
- Evitar cantos arredondados. Cards e quadrados informativos usam cantos retos; pequenos raios ficam restritos a controles que dependem disso para reconhecimento e ergonomia.
- Usar as logos oficiais fornecidas pelo usuário, sem redesenho:
  - `C:\Users\Nickolas\Documents\FOOTBASE\LOGO FOOTBASE SVG.svg`: wordmark branca com ponto verde para fundos grafite/verde.
  - `C:\Users\Nickolas\Documents\FOOTBASE\LOGO FOOTBASE SVG PRETO.svg`: wordmark preta com ponto verde para fundos brancos.
- Preservar o ponto verde, proporções e paths originais das logos. Na implementação, copiar os arquivos para os assets públicos do projeto e recortar apenas o `viewBox` ao conteúdo, sem alterar o desenho.

## Limites de escopo

### Deve mudar

- Tokens de cor, elevação, bordas, sombras, foco e transições; raios globais são reduzidos ao mínimo.
- Hierarquia tipográfica, espaçamento interno e acabamento dos componentes.
- Aparência de header, navegação, botões, badges, campos, selects, modais, cards, widgets, tabelas, gráficos e prancheta.
- Uso criterioso de gradientes, linhas e formas inspiradas no campo e em transmissões esportivas.
- Consistência visual entre landing, autenticação e área interna.

### Não deve mudar

- Ordem das seções da landing: Header, Hero, Features, HowItWorks, ForWhom, CtaBand e Footer.
- Organização, colunas e largura estrutural dos blocos.
- Header, navegação e grid full-width do sistema interno.
- Filtros, colunas, ordenação e comportamento das tabelas.
- Conteúdo, textos, traduções, dados, rotas, permissões e regras de negócio.
- Fluxos de autenticação, favoritos, comparação e prancheta.
- Responsividade funcional existente.

## Sistema visual

### Tema escuro

- Canvas: Grafite `#121212`.
- Superfícies: branco entre 3% e 7% sobre grafite, sem introduzir verde-escuro como nova cor base.
- Texto principal: Branco `#FFFFFF`; texto secundário usa branco com 58%–72% de opacidade.
- Bordas: branco com 10%–16% de opacidade.
- Verde: CTAs, estados ativos, indicadores, foco, números estratégicos e detalhes de campo.

### Tema claro

- Canvas e superfícies: Branco `#FFFFFF`, separados por bordas e sombras derivadas do grafite.
- Texto principal: Grafite `#121212`; texto secundário usa grafite com 58%–70% de opacidade.
- Verde: CTAs, estados ativos, indicadores e detalhes gráficos.
- Áreas extensas em verde usam texto grafite ou branco conforme o contraste.

### Tipografia, forma e movimento

- Manter a família sans-serif já carregada para evitar dependência e regressão de desempenho.
- Títulos de página, seção e widget: peso alto, caixa alta e itálico esportivo, com tracking controlado.
- Texto corrido, filtros e tabelas: estilo neutro, sem itálico, priorizando leitura.
- Números e métricas: algarismos tabulares quando disponíveis, peso alto e hierarquia clara.
- Cards informativos com bordas finas, cantos retos e elevação discreta.
- O cabeçalho superior nunca usa gradiente. Gradientes podem aparecer somente como detalhes de baixa intensidade no hero, CTA final ou destaques, sem arredondar os blocos.
- Linhas de campo, faixas diagonais e halos verdes em baixa opacidade como moldura, nunca atrás de textos densos.
- Transições entre 150 e 220 ms, respeitando `prefers-reduced-motion`.
- Foco visível em todos os controles interativos.

## Aplicação por área

### Landing page

- Header conserva logo, links, toggles e CTAs nas mesmas posições; fica sempre grafite, sem gradiente, com a logo clara oficial.
- Hero conserva duas colunas, textos e card demonstrativo. A energia visual vem de gradiente, linhas de campo discretas e headline mais forte.
- Features, HowItWorks e ForWhom mantêm seus grids; cards ganham indicadores verdes consistentes.
- CtaBand vira o principal momento de marca, sem mudar conteúdo ou ação.
- Footer mantém sua organização e usa a variação correta da logo por tema.

### Autenticação

- Login, cadastro e aguardando aprovação mantêm todos os campos e fluxos.
- `AuthCard`, inputs e estados de erro/sucesso recebem o mesmo acabamento premium e contraste dos temas.

### Sistema interno

- `AppHeader` mantém logo, busca, toggles e perfil; fica sempre grafite, sem gradiente, com a logo clara oficial.
- `AppNav` mantém itens e comportamento; estado ativo ganha faixa verde precisa e contraste melhor.
- Dashboard mantém o grid de três trilhas e todos os widgets. O redesign melhora cabeçalhos, métricas, separadores e leitura escaneável.
- Busca de atletas mantém filtros, tabela e colunas. Cabeçalho, linhas, sort e estados de hover/foco serão uniformizados.
- Dossiê e comparação preservam matrizes e informações; cards de métricas passam a compartilhar o mesmo padrão visual.
- Prancheta mantém gramado, formação, slots e banco; o campo recebe acabamento Matchday sem alterar coordenadas ou interações.

## Componentes e arquitetura

- Centralizar os tokens em `app/globals.css`; componentes continuam usando classes semânticas (`bg-background`, `bg-surface`, `text-brand`, `border-border`).
- Evoluir o kit compartilhado antes das telas: `Logo`, `Button`, `Badge`, `Input`, `Select`, toggles e containers de diálogo.
- Criar utilitários visuais pequenos apenas quando usados em três ou mais áreas.
- Evitar duplicação de gradientes e sombras em componentes individuais.
- Não alterar contratos de props nem fluxo de dados quando a mudança for apenas estética.

## Responsividade e acessibilidade

- Validar landing em 360, 768, 1024 e 1440 px.
- Validar sistema interno em 360, 768, 1280 e 1440 px, mantendo full-width no desktop.
- Preservar scroll horizontal das tabelas e navegação móvel existentes.
- Contraste mínimo WCAG AA para texto e controles.
- Foco visível, alvos mínimos de toque e estados disabled/loading claros.
- Não depender apenas do verde para comunicar sucesso, alerta, seleção ou erro.

## Estados e erros

- Loading preserva dimensões para evitar salto de layout.
- Empty states mantêm textos e ações; muda apenas a hierarquia visual.
- Erros usam contraste e ícone. Vermelho pode continuar como cor semântica funcional, sem integrar a paleta de marca.
- Tema e idioma continuam persistindo sem hydration mismatch.

## Validação

- `npx tsc --noEmit --incremental false`.
- Testes existentes de comparação e prancheta.
- `npm run build`.
- Revisão visual nos dois temas e breakpoints definidos.
- Conferir `/`, `/login`, `/cadastro`, `/aguardando-aprovacao`, `/dashboard`, `/atletas`, `/atletas/[bid]`, `/atletas/comparar` e `/prancheta`.
- Auditoria de acessibilidade e consistência após a implementação.
- Revisão independente de código antes da conclusão.

## Critérios de aceite

- Organização e funcionalidades permanecem idênticas.
- Landing e área interna parecem partes do mesmo produto.
- Logos oficiais corretas aparecem conforme o fundo.
- Os dois cabeçalhos superiores exibem a logo clara sobre grafite fixo e não mudam com o tema.
- Cards de informação não têm cantos arredondados perceptíveis.
- Nenhuma cor de marca além das três aprovadas é introduzida; cores semânticas ficam restritas a feedback funcional.
- Ambos os temas são legíveis, responsivos e sem regressões.
- Build, tipagem e testes existentes passam.
