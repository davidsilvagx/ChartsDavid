# Filtros e reprodução do estúdio — 03/11/26

O filtro aparece acima do estúdio (“Filtrar período do vídeo”) e junto a Linhas/Barras (“Filtrar ano, mês ou semana”). O modal separa **datas incluídas** de **um quadro por**. É possível selecionar um ano, um mês, a semana de uma data, datas livres ou todo o histórico. O início do calendário e o dia atual limitam o intervalo; datas futuras não geram dados.

Exemplos: agosto de 2026 preenche 01/08/26–31/08/26 e produz cinco quadros semanais; a semana de 19/08/26 preenche 14/08/26–20/08/26 e oferece sete quadros diários. Um ano agrupado por ano gera um ranking estático: o botão “Criar vídeo por meses” recalcula o mesmo intervalo em meses reais. Um dia isolado permanece um quadro único, com indicação para ampliar as datas ou salvar PNG. A sequência enviada preserva todas as datas escolhidas, inclusive períodos vazios ou incompletos.

O Top de Barras agora possui seleção automática de 5, 10, 15, 20 ou 30 posições. Inclui todos os itens que chegam ao Top durante o intervalo, preservando entradas, saídas e ultrapassagens. O limite não fica preso aos cinco competidores do preset. Alterar o Top ativa novamente a seleção automática; presets e catálogo permitem selecionar manualmente, com indicação explícita e botão para voltar ao automático. Em Linhas, a escala Top 10–100 representa posições, e os competidores continuam editáveis.

As barras usam contagens compactas de **todos** os itens ouvidos em cada período, inclusive fora do Top 100. As posições oficiais continuam limitadas ao Top 100 e não são inventadas. O acumulado começa no início do intervalo escolhido. Um heap limitado ao Top solicitado evita ordenar todo o acervo a cada período; a preparação roda em Worker com payload sem imagens ou chart runs. A lista inicial de competidores mostra até 60 cards, com acesso ao catálogo completo. A renderização adapta barras e capas ao espaço disponível.

Trocar de época remove competidores ausentes e escolhe itens reais quando a seleção anterior não aparece no novo intervalo. Estados de preparação, ausência de dados e quadro único explicam por que o play não está disponível. O botão de envio ao estúdio fica antes da tabela, sem exigir rolar cem músicas.

A prévia, cinema, PNG e vídeo acompanham o tema do aplicativo. O botão duplicado sobre o canvas foi removido; “Ver maior” permanece acima dele. Cabeçalho e transporte do cinema usam as cores do tema.

## Verificação

- Testes de Tops 5/10/15/20/30, heap versus ordenação de referência, acumulados com itens fora do Top 100, períodos ausentes/vazios, troca de época e datas de ano/mês/semana, incluindo limites do calendário e futuro.
- Opera com histórico real: agosto de 2026 enviado com cinco períodos; play avançou até 5/5. Semana de 19/08/26 enviada como sete dias e reprodução de Linhas iniciada. Ranking anual único convertido em 11 meses reais de 2026 e Tops 5–30 preparados e reproduzidos.
- Layouts 320, 384 e 430 px sem overflow e sem controles sobre o canvas. As verificações automatizadas e o build são executados antes da publicação. Emulação não equivale a medição de temperatura em aparelho físico.
