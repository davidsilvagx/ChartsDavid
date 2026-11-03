# Histórico completo e charts por período — 03/11/26

- Acesso visível em Início, Charts e Estúdio: “Explorar dias, meses e anos”. O download completo fica disponível diretamente nessas telas quando há semanas pendentes.
- O arquivo lista todas as semanas do calendário configurado, agrupadas por ano e mês da sexta-feira inicial. O seletor de anos não depende das oito semanas recentes e mostra o que foi baixado.
- No perfil de referência, são 541 semanas desde 24/06/16, incluindo todas as 44 semanas iniciadas em 2026 até 03/11/26. Não se geram semanas futuras para completar artificialmente o ano.
- Cada ano/período distingue download pendente, parcialmente baixado e zero reproduções confirmado. Uma semana ausente não vira uma semana vazia.
- O agrupamento mensal do **arquivo semanal** usa o mês da sexta-feira inicial. Para contar o mês civil exato, a aba **Charts por período** agrupa os timestamps reais do primeiro ao último dia, respeitando o fuso configurado.
- Charts por dia, semana, mês e ano são calculados em Worker separado, com indicador de carregamento, a partir dos scrobbles salvos. Os períodos incompletos ficam sinalizados. Datas iniciais/finais, plataforma, aliases e deduplicação são respeitados.
- “Usar todo o histórico” permite animar todos os anos juntos, inclusive os 126 meses de 24/06/16 até 03/11/26. Charts diários permitem qualquer ano em consultas de até 366 dias; o limite é explícito para evitar esgotar a memória de celulares em animações com milhares de quadros temporais.
- “Animar estes períodos no estúdio” envia os mesmos rankings e catálogo ao editor, com indicação do intervalo. É possível alterar o agrupamento ou voltar ao calendário semanal oficial. A numeração semanal original é preservada.
- O download de arquivo agora começa pelas semanas mais novas e continua até as antigas, sem limitar a oito. Pausar/retomar mantém as semanas salvas.
- Foram adicionadas 12 ilustrações vetoriais originais inspiradas em Madonna, Miley Cyrus, Selena Gomez, Lady Gaga, Beyoncé, Rihanna, Ariana Grande, Taylor Swift, Britney Spears, Dua Lipa, Shakira e Katy Perry. Os 12 avatares musicais existentes continuam disponíveis.
- Assinatura: “Feito com ❤️ por William Santos” no aplicativo e nos materiais renderizados.

## Verificação

Testes de negócio incluem arquivo completo sem corte de oito semanas, todos os anos e meses, zero versus ausência de download, fronteiras de dias/meses/anos, fuso, datas futuras, preservação da numeração semanal e filtro de plataforma. TypeScript, suíte e build são executados antes da publicação.

No Opera, a base real de 541 semanas foi usada para validar 44/44 semanas de 2026, agrupamento de todos os 126 meses, consulta de um dia com 22 reproduções e envio dos 126 períodos para o editor. Modal validado em 320, 360, 384, 412 e 430 px sem transbordamento. Emulação não substitui teste em aparelho físico.

## Cinema, instalação e consumo

- O cinema mede a área restante depois do cabeçalho e transporte e encaixa o canvas inteiro na proporção escolhida. Regressão reproduzida em 854×384: canvas de 617 px dentro de uma área de 186 px. Após a correção, o canvas tem 255 px e cabe na área de 271 px, com o #100 e a assinatura visíveis. Também conferido em 740×360 e em retrato.
- Instalação acessível pelo cabeçalho e pelo cartão “Instalar no celular” no início, com instruções Android/Samsung e iPhone quando o navegador não oferece o prompt nativo. Sem transbordamento entre 320 e 430 px.
- A prévia usa automaticamente até 30 fps e DPR máximo de 1,5 no celular; há opção de 60 fps. A exportação mantém 60 fps. Reprodução é pausada ao ocultar a página; canvas fora da tela não é redesenhado. Prévia parada apresentou zero novos desenhos durante a amostra.
- Índices da animação guardam somente os competidores escolhidos; snapshots cumulativos são criados somente para barras cumulativas. Capas decodificadas ficam em cache LRU de 48 imagens, com até quatro downloads simultâneos e limite de 512 px por imagem. Efeitos ambientais contínuos são desativados em telas móveis.
- Testes verificam o encaixe do vídeo, a preservação de posições/contagens e descarte de recursos do cache. Não foi medida temperatura ou autonomia em um S24 físico; esses resultados não são garantidos pela emulação.

Referências técnicas: [otimização de Canvas](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas), [visibilidade de página](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API) e [instalação PWA](https://web.dev/learn/pwa/installation-prompt).
