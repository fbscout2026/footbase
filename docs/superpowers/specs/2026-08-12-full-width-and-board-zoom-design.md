# FOOTBASE — Landing Full-Width e Zoom da Prancheta

## Objetivo

Eliminar as faixas laterais sem preenchimento da landing page e permitir que o usuário reduza ou amplie a visualização do campo da prancheta tática, sem alterar a organização, o conteúdo ou o funcionamento existente.

## Landing page

- Todas as seções visuais ocupam 100% da largura disponível da viewport.
- Fundos, linhas e molduras de seção chegam às bordas da tela, removendo as faixas laterais vistas em monitores largos.
- O conteúdo textual continua dentro de uma área interna legível e alinhada, evitando linhas excessivamente longas.
- Cabeçalho superior permanece grafite `#121212`, sem gradiente e com a logo clara oficial.
- A ordem, os textos, os CTAs e a composição em colunas permanecem inalterados.
- A solução deve funcionar nos temas claro e escuro e não gerar rolagem horizontal na página.

## Zoom da prancheta

- A seção do campo recebe três controles acessíveis: diminuir (`−`), restaurar/indicar percentual e ampliar (`+`).
- Faixa permitida: 60% a 140%, em passos de 10%.
- O valor inicial é 100%.
- O botão percentual restaura a visualização para 100%.
- O zoom transforma somente o campo e os atletas posicionados nele.
- Formação, titulares, banco, seleções manuais, notas e persistência no Supabase não são modificados pelo zoom.
- Em ampliação superior ao espaço disponível, o campo fica dentro de uma área rolável; a página não ganha overflow horizontal.
- Os botões têm alvos de toque adequados, foco visível, estados desabilitados nos limites e nomes acessíveis.
- O percentual atual é exposto de forma legível e por `aria-live` para tecnologias assistivas.

## Componentes e estado

- `TacticalBoardClient` mantém um estado local de zoom. Ele não é persistido, pois representa apenas uma preferência momentânea de visualização.
- `TacticalPitch` recebe o percentual e aplica a escala a um invólucro próprio, preservando a proporção `68/100` e as coordenadas dos onze slots.
- Os controles ficam no cabeçalho do card da prancheta, junto aos contadores, sem criar uma nova seção funcional.
- As seções da landing usam um invólucro full-width com conteúdo interno centralizado, reutilizando a organização atual.

## Tratamento de limites

- Diminuir fica desabilitado em 60%.
- Ampliar fica desabilitado em 140%.
- A restauração permanece disponível quando o valor for diferente de 100%.
- Mudanças rápidas de zoom não disparam gravações no banco nem interferem em mutações da escalação.

## Validação

- Verificar a landing em larguras móveis e em desktop largo, sem faixas laterais ou overflow horizontal.
- Verificar zoom em 60%, 100% e 140%, incluindo rolagem interna quando necessária.
- Verificar operação por mouse, toque e teclado.
- Confirmar que escolher atletas, trocar formação, preencher o melhor XI e salvar a prancheta continuam funcionando.
- Executar TypeScript, testes da comparação, testes da prancheta e build de produção.

## Fora do escopo

- Reorganizar seções da landing.
- Alterar textos ou identidade visual.
- Persistir o nível de zoom entre sessões.
- Implementar gestos de pinça, zoom pela roda do mouse ou movimentação livre do campo.
