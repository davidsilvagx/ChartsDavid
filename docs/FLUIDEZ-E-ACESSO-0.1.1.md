# Fluidez e acesso · beta 0.1.1

- [x] Analisados os vídeos enviados: rolagem da página e gravação de linhas, com arquivos de aproximadamente 12 e 32 segundos.
- [x] Sessão atual consultada antes da validação no servidor; falha de rede não troca o espaço compartilhado para convidado. Trocas de preferências usam trava entre abas; removida a navegação indiscriminada de outras janelas pelo service worker.
- [x] Preparação e assinatura do backup em worker; removidas coletas completas repetidas na mesma tentativa, preservando a detecção de edições concorrentes.
- [x] Continuação do backup aguarda o fim da prévia/gravação; dados permanecem locais durante a espera.
- [x] Transporte dos charts compartilha as trajetórias; as versões históricas de cada trajetória são materializadas quando consultadas. Preparação da interface em lotes com pausas após cerca de 8 ms; worker de cálculo encerrado ao entregar os resultados.
- [x] Testes preservam posições, lacunas OUT, semanas desconhecidas e snapshots históricos após a compactação.
- [x] Traços de linhas agrupados por competidor, mantendo as curvas e sem conectar lacunas. Blur de superfícies fixas removido no toque/tablet, preservando cores e acabamento.
- [x] Gravação automática em 30 fps no celular; opção de 60 fps preservada. Rótulos informam que a escolha também vale para a exportação.
- [x] Marca maior fora do cartão móvel; avatar escolhido lembrado após logout. Apenas aparência é lembrada, sem e-mail, senha ou sessão; imagens exigem HTTPS.
- [x] Fundo com gradações animadas por transform/opacity, ícones musicais e respeito à preferência de movimento reduzido.
- [x] Corrigida rolagem interna invisível no acesso: o fundo decorativo criava uma área rolável e o foco deslocava o cartão. O contêiner agora usa clip; avatar e formulário ficam empilhados também no tablet/desktop.
- [x] Opera, zoom 100%: cadastro em 320×568 sem overflow; entrada em 390×844, cadastro no tablet 768×1024 e recuperação no desktop 1440×900 alinhados. A entrada em 320×568 usa 39 px de rolagem natural, com todos os controles acessíveis; não há rolagem interna invisível.
- [x] 229 testes em 34 arquivos, TypeScript e build aprovados.

## Evidências e limites

Carga isolada de QA: 540 semanas e 183.600 reproduções sintéticas, identificadas como QA; os dados dos usuários não foram usados ou alterados. Na amostra do Opera, a preparação síncrona do pacote de charts chegou a 1.312 ms; após preparação em lotes, o maior HandlePostMessage da amostra de carga foi 43,7 ms. Ainda houve tarefas de inicialização de aproximadamente 100 ms e coleta de lixo: isso não significa ausência absoluta de pausas em qualquer aparelho.

A gravação de cinco períodos concluiu e baixou WebM/VP9 de 1.606.905 bytes, 1280×720, 125 quadros e aproximadamente 4,97 s; intervalo mediano entre quadros de 34 ms, aferido pelos timestamps do contêiner. A medição não equivale a 30 fps constantes em todos os dispositivos.

As provas responsivas são emulação no Opera do computador. Validação física de GPU, bateria e barra do sistema em Android/iPadOS continua dependendo desses aparelhos. Nenhum resultado é promessa de que todos os aparelhos terão desempenho idêntico.
