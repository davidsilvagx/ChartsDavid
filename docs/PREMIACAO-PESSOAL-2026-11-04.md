# Premiação pessoal e tutorial — 04/11/2026

Base: `f301138` (PR #11). As integrações Blob, push, catálogo e demais melhorias anteriores foram preservadas.

## Pedidos atendidos

- [x] Tutorial de conexão: número e conteúdo ocupam duas colunas reais, com título e parágrafo agrupados, cartões legíveis e navegação adequada ao celular. Cada troca de etapa volta ao topo do diálogo.
- [x] Palco dos indicados: gradiente verde/petróleo, cartões com contraste e borda sutil. Sem listras, friso ou linha dourada atravessando o conteúdo. Cortinas existem somente durante a revelação, em todas as categorias.
- [x] Gravação do Ano: até cinco indicados escolhidos por curadoria entre as vinte músicas mais reproduzidas no ano selecionado.
- [x] Artista Revelação: primeira entrada no Top 100 pessoal de artistas naquele ano. Não depende da estreia profissional, idade, discografia ou indicações oficiais ao Grammy.
- [x] Artista do Ano: categoria exclusiva LastChart, com desempenho combinado do ano selecionado. Não é apresentada como categoria oficial do Grammy.

## Critérios autorizados pelo usuário

### Gravação do Ano

Os seis jurados virtuais comparam o Top 20 anual: volume, duração confirmada × plays, desempenho no chart, constância semanal, ascensão e afinidade com o artista (plays anuais do artista). Cada jurado ordena os vinte candidatos; os pontos Borda são somados, com divisão de pontos nos empates. Sem informação suficiente ou com todos empatados, o jurado se abstém.

A curadoria escolhe os cinco melhores, com até duas faixas por artista se houver alternativas suficientes; completa a lista quando não houver diversidade suficiente. Desempate por reproduções, nome e ID. Não há sorteio nem obrigação de produzir um vencedor diferente de Canção do Ano. Cada indicado mostra sua posição no Top 20 e a pontuação de curadoria. O júri então decide entre os cinco selecionados; a pontuação da indicação é diferente da votação final.

### Revelação

O histórico completo disponível é examinado, desde o início da contagem e na fonte escolhida. Primeira audição fora do Top 100 não é estreia no chart. Madonna estreando no chart pessoal em 2026 é elegível em 2026; artista que já entrou em 2024 não volta como revelação em 2026.

Se falta alguma semana anterior ou uma semana histórica está incompleta, uma entrada recente fica **não confirmada**, com instrução para baixar o histórico. Nunca tratar dado ausente como prova de estreia. Sem estreantes elegíveis, mostrar isso claramente. Metadados de carreira continuam disponíveis em outros recursos, mas não definem esta premiação pessoal.

### Artista do Ano

Pontuação de 0 a 100: **45% músicas diferentes no Top 10 + 35% reproduções + 20% semanas com música em #1**. Cada componente é dividido pelo maior valor entre os artistas daquele ano, com proteção para denominador zero. São os rankings semanais de músicas que definem hits e semanas em #1. A mesma faixa repetida em semanas diferentes conta como uma música no componente de variedade.

Artistas com carreira anterior podem concorrer com a atividade no ano escolhido; reproduções e conquistas de outros anos não entram na pontuação. Um artista ouvido só em 2024 não concorre em 2026. Estreia no ano é uma exigência exclusiva de Revelação. Desempate por plays anuais, nome e ID.

## Calendário, dados e compatibilidade

- Mantido o calendário semanal configurado: o ano de cada semana é definido pela sexta-feira inicial. Não se altera a contagem existente para ano civil.
- Estatísticas anuais usam apenas semanas do ano escolhido. Histórico anterior serve para verificar estreia e preservar o desempate semanal do motor de charts.
- Filtros de fonte, aliases e deduplicação são respeitados. A classificação semanal usa os mesmos desempates do motor existente.
- Cálculo do histórico executado no Worker, somente ao abrir Premiação, sem novas consultas externas para Revelação ou Artista do Ano.
- Todo o histórico não produz essas três categorias anuais: há orientação e atalho para selecionar um ano.
- As cédulas existentes permanecem salvas. Gravação do Ano e Revelação antigas pedem **Atualizar indicados** antes de votar/revelar pelas novas regras, avisando que só os indicados e votos daquela categoria serão substituídos. Artista do Ano pode ser adicionada às cédulas antigas pelo botão correspondente.
- Mantidas as 100 categorias oficiais do catálogo; Artista do Ano é a 101ª opção, identificada como exclusiva LastChart.

## Validação

Testes de regressão cobrem curadoria determinística no Top 20, limite de cinco, pools pequenos/vazios, carreira antiga com estreia pessoal recente, reentradas, semanas anteriores ausentes/incompletas, filtros de fonte, desempate alinhado ao motor de charts, cálculo 45/35/20, componentes zerados e preservação das cédulas.

Validação visual no Opera em 360 × 740, 384 × 854 e 854 × 384 CSS pixels; tutorial e cerimônia em retrato/paisagem, critérios com o histórico real Iknowjauregui. Emulação de viewport não equivale a teste em hardware Galaxy físico.
