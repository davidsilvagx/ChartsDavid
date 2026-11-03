# LastChart Studio Pro — especificação técnica

Versão 1 · 2 de novembro de 2026 · Projeto independente ChartsDavid.

## 1. Produto e decisão

Um estúdio pessoal de história musical: transformar scrobbles reais em rankings semanais auditáveis, explorar trajetórias e produzir vídeos compartilháveis. Português brasileiro, interface original inspirada na clareza de One UI/iOS, sem copiar marca ou código do Last.fm/ZeroCharts.

**Pronto:** Last.fm + ZeroCharts resolvem coleta e rankings, com menor esforço inicial, mas não permitem controlar o produto, o motor de vídeo ou a consistência de calendário. Dependência de planos e de mudanças do fornecedor.

**Adaptar:** combinar ferramentas de estatística e chart race economiza renderização inicial, mas exige conciliar regras diferentes, licenças e histórico; risco de resultados incompatíveis e interface fragmentada. Esforço médio.

**Criar (escolhido):** PWA React/TypeScript, agregação própria determinística, IndexedDB e Canvas. Mais esforço de desenvolvimento e testes; sem banco ou conta compartilhada com outros projetos, custos ligados à hospedagem/tráfego e limites das APIs. Reutilizar bibliotecas maduras para datas, armazenamento e ícones. Não estimar mensalidades sem plano e tráfego medidos.

## 2. Pesquisa e oportunidades

Pesquisa documental, não um levantamento quantitativo de popularidade. Os relatos abaixo demonstram problemas, não permitem afirmar quais são os pedidos mais frequentes.

- Duplicatas, sincronização interrompida e históricos incompletos: [relatos de scrobbling](https://support.last.fm/tag/scrobbling/8?match_all_tags=true&page=1&tags%5B%5D=scrobbling). Resposta: progresso, cancelamento, retomada, diagnóstico, backup e ausência explicitamente diferente de zero.
- Artistas/edições misturados e necessidade de corrigir nomes: [merging](https://support.last.fm/tag/merging/186), [shared artist](https://support.last.fm/tag/shared-artist/139). Resposta: preservar metadados originais e edições, sem corrigir ou fundir nomes silenciosamente. Editor de aliases é evolução, com prévia auditável.
- Capas e catálogo inconsistentes: [catalogue](https://support.last.fm/tag/catalogue/54). Resposta: capa de scrobble e busca auxiliar validada por artista/título, fallback visual honesto.
- Referência visual consultada: [Last.fm](https://www.last.fm/); referência autorizada na sessão Opera: [ZeroCharts Stats](https://zerocharts.com.br/stats). Página vista com aviso de novidades sobre posições e promessa de histórico/picos; nenhuma regra privada foi inferida.
- Diferenciais propostos: calendário configurável, anos sem perder acumulados anteriores, tabela detalhada, histórico de reentradas, estúdio exportável, modo offline, temas, instalação e interface móvel real.

## 3. Navegação e desenho

Desktop: barra lateral compacta fixa; topo com identidade e sincronização; conteúdo com cabeçalho editorial, filtros em pills, cartões de resumo, gráfico e tabela. Mobile: navegação inferior com cinco destinos, áreas seguras, cabeçalho curto, controles empilhados, detalhes da tabela em modal. Nada depende de hover.

Destinos: **Visão geral**, **Charts**, **Estúdio**, **Biblioteca**, **Ajustes**. Identidade: fundo off-white/cinza mineral, superfícies brancas, texto grafite, verde profundo e limão suave como acento; tema escuro com carvão, bordas discretas e contraste preservado. Ícones Lucide, curvas amplas, espaços em múltiplos de 4/8, tipografia de sistema e números tabulares. Alvos de toque de pelo menos 44 px, inputs de 16 px, foco visível, labels e reduced-motion. Sem números fictícios para preencher tela.

Larguras alvo: 320, 360, 384, 412, 430, 768, 1024 e 1440 CSS px. Galaxy Ultra pode usar diferentes larguras CSS conforme zoom/densidade; não tratar resolução física como viewport. Canvas escalado por DPR limitado, sem ampliar a página. Tabela longa usa detalhes por item no celular; somente o conteúdo tabular pode rolar lateralmente. Modais usam max-height em dvh e rolagem própria.

## 4. Contrato de calendário e dados

- Semana 1: sexta **2016-06-24 00:00** até a próxima sexta exclusiva. O usuário escolhe um fuso IANA; padrão UTC, confirmado na configuração do ZeroCharts de Iknowjauregui pelo Opera. A referência está em Top 20, mas este produto usa Top 100 conforme pedido. Usar aritmética de calendário com Temporal, não somar 604800 segundos em semanas que atravessam horário de verão.
- Toda semana é intervalo `[início, próxima sexta)`. Consultar a API com margem de fronteira e filtrar timestamps localmente. Now playing não conta.
- Data inicial configurável deve ser sexta-feira. Não alterar silenciosamente uma data inválida. Alterar fuso/data invalida a interpretação das semanas e usa outro namespace de cache.
- Semana atual identificada como parcial. Semanas não baixadas são desconhecidas, jamais zeros. Semanas baixadas vazias são preservadas.
- Identidade conservadora: artista + título + álbum para faixas; artista + álbum para álbuns; artista para artistas; normalização Unicode/trim/case apenas. Deluxe, live, remix e regravações permanecem separadas. MBIDs são metadados auxiliares porque podem faltar entre scrobbles.
- Contagem: 1 scrobble válido = 1 reprodução. Álbuns sem nome não são inventados. Não inferir ouvintes, streams globais, vendas ou duração de audição.
- Duplicatas exatas de timestamp + artista + faixa + álbum são diagnosticadas; exclusão deve ser opção explícita. Paginação estável e resposta completa antes de confirmar semana.
- Ordenação determinística: reproduções desc; em empate, melhor posição na semana imediatamente anterior; depois identidade lexical. É a regra deste produto, **não alegar paridade exata com o desempate interno do ZeroCharts**.
- Ranking canônico Top 100. Top 50/30/20/10 são recortes visuais; pico e semanas são Top 100. Variação compara semana anterior; NEW se nunca esteve no Top 100 no histórico conhecido, RE se retornou após ausência. Se falta cobertura anterior, estreia/pico/semanas são explicitamente relativos ao trecho carregado.
- Pico, semanas e chart run calculados cronologicamente; filtro de ano aplicado depois dos acumulados. Chart run preserva OUT e lacunas desconhecidas. Não inventar participações anteriores.
- Histórico inteiro percorre todas as semanas desde o marco oficial; escolha de um ano define semanas pela sexta inicial (semanas que cruzam dezembro/janeiro pertencem ao ano da sexta).

## 5. APIs, cache e sincronização

Last.fm GET `https://ws.audioscrobbler.com/2.0/`, `format=json`, `api_key`, `user`. Documentação: [recent tracks](https://www.last.fm/api/show/user.getRecentTracks), [weekly intervals](https://www.last.fm/api/show/user.getWeeklyChartList), [termos](https://www.last.fm/api/tos).

`user.getInfo` valida perfil; `user.getRecentTracks` com até 200 registros/página fornece timestamps, artista, álbum e capa; endpoints semanais nativos servem como referência, não garantem sexta no fuso escolhido. Autenticação de leitura de perfil público dispensa senha/sessão. A API key não é um API secret; ainda assim a chave fornecida fica apenas em arquivo local ignorado/variável Netlify, nunca no Git.

Produção: função Netlify proxy com allowlist de métodos e parâmetros, chave em `LASTFM_API_KEY`, timeouts, resposta de erro clara, nenhuma escrita de scrobbles. Desenvolvimento: proxy Vite equivalente. Alternativa configurável: chave pessoal mantida só nesta instalação e conexão direta Last.fm. Não há login compartilhado com outro projeto.

Lotes pequenos, limite de início de requisições e retries exponenciais com jitter para 429/5xx/erros temporários. Cancelamento por AbortController. Congelar o limite temporal da consulta; confirmar cada semana em transação somente depois de todas as páginas. Falhas preservam semanas concluídas; retomar usa cache; revalidar semanas recentes para scrobbles atrasados. Históricos antigos podem mudar no Last.fm: disponibilizar ressincronização explícita.

IndexedDB: semanas brutas por usuário + calendário; timestamps de atualização; versão do schema. Preferências separadas por namespace `lastchart-studio`, backup JSON versionado validado e CSV de rankings. Agregação em Web Worker. Sem envio de histórico para analytics ou outros projetos. Limites reais de armazenamento variam por dispositivo.

Capas: primeiro Last.fm; metadados extras podem usar catálogo Apple iTunes via proxy. Somente associação exata por artista/título (sem prometer catálogo completo). Links para ouvir no Last.fm/YouTube/Spotify. Reprodução completa exige fornecedor e direitos; não embutir download não autorizado.

## 6. Estúdio

Canvas 2D com requestAnimationFrame, alvo de 60 fps (não garantia em hardware não medido). Linha Bézier monotônica entre semanas, capa circular na ponta, card com posição/artista/título. Número muda discretamente na semana, sem contagem intermediária. Linhas quebram quando há OUT/semana desconhecida; não unir ausências.

Escala vertical fixa 1–100, alternativas 50/30/20/10. Referências horizontais #1, #10, #20, #40, #60, #80, #100, recortadas ao limite. Top 10 tem destaque sutil. Cem posições cabem na área; cem cards legíveis simultaneamente num telefone são fisicamente inviáveis: manter todas as linhas selecionadas, limitar/organizar cards e oferecer legenda selecionável. Seleção não recalcula posições: competição contra todo o ranking real.

Timeline começa na primeira entrada entre os selecionados e termina na última entrada conhecida, mantendo semanas vazias e reentradas. Enquanto histórico não for integral, comunicar limites do trecho. Controles de play/pause, scrubbing, velocidade, espaçamento temporal, espessura, paleta/cor individual, capa, texto, efeitos, paisagem/quadrado/vertical. Entrada em #1: coroa e partículas douradas; primeira entrada no Top 10: pulso e estrelas; não disparar efeitos a cada frame.

Seleção livre e seleção de todas as faixas/álbuns de um artista **presentes no histórico sincronizado**, sem cap arbitrário de itens. Isso é a discografia ouvida, não uma promessa de discografia mundial completa. Catálogo completo publicado (inclusive nunca ouvido) requer MusicBrainz/Spotify com paginação e desambiguação; itens nunca ouvidos não recebem posições fabricadas.

Exportação: PNG do frame, CSV da tabela, vídeo com Canvas.captureStream + MediaRecorder; verificar MIME disponível, preferir WebM ou MP4 quando nativo. Gravação em tempo real, progresso e cancelamento, avisar sobre aba em segundo plano. Trilha local opcional autorizada pelo usuário via Web Audio; sem trilha o vídeo funciona. Encerrar tracks e liberar URLs. Nunca dizer MP4 quando o arquivo é WebM. Imagens remotas precisam CORS; fallback evita canvas contaminado.

## 7. Recursos adicionais úteis

Visão geral: reproduções, itens, artistas, novo #1, novos Top 100, maiores altas, primeiras audições no trecho, distribuição por artista e atividade semanal. Biblioteca: busca por artista/faixa/álbum, filtros por tipo, favoritos locais, drill-down de chart run. Exportação e backup independentes. Preferências persistentes: tema sistema/claro/escuro, calendário, usuário, chave opcional, efeitos reduzidos. Instalação PWA e consulta offline dos dados baixados.

Evoluções com dependências explícitas: aliases auditáveis com desfazer; comparação de dois perfis; importação de CSV de outras fontes com mapeamento; playlists via OAuth; catálogo global MusicBrainz com confirmação de homônimos; sincronização entre dispositivos com conta própria; render MP4 offline/WebCodecs. Nenhuma destas deve aparecer como botão funcional se não estiver implementada.

## 8. Segurança, operação e independência

Checkout exclusivo `/Users/ripio/Documents/Meus apps/Charts`, remoto único `davidsilvagx/ChartsDavid`. Não ler/copiar configurações, contas, tokens, bancos ou variáveis de `ideas ripio`. Git author local ao repositório; não trocar conta global do gh. Se login David for necessário, usar sessão isolada e encerrar no fim conforme pedido.

Netlify: build `npm run build`, publish `dist`, functions `netlify/functions`, redirects SPA, HTTPS, cabeçalhos de segurança e cache de assets. Chave em ambiente Netlify, nunca no bundle. Sem deploy Netlify automático nesta etapa: usuário fará vínculo. CI: instalação lockfile, typecheck, testes e build.

## 9. Plano de validação

Testes de domínio: sexta e quinta nos limites; DST; ano bissexto; semana vazia; lacuna desconhecida; empate; reentrada; novos lançamentos em anos diferentes; mudança de filtro preserva acumulados; now playing; duplicatas; resposta sem álbum; paginação, falha temporária, cancelamento; importação inválida; proteção CSV contra fórmulas.

Verificar API ao vivo com perfil identificado e chave fornecida sem imprimir segredo. Testar TypeScript, build e dependências. Testar no Opera autorizado: desktop e viewport móvel, menu inferior, modal longo, foco, temas, exportação, gravação e reload offline. Emulação não substitui aparelho físico: relatar exatamente o que foi verificado; teste físico Galaxy/iPhone continua necessário para comprovar fps, download e instalação naquele aparelho.

## 10. Critérios de entrega

Documento antes do código; aplicativo navegável com dados reais ou estado vazio honesto; calendário determinístico; cache retomável; tabela e biblioteca; estúdio com exportação; PWA; ajustes; testes reproduzíveis; README Netlify; código no repositório solicitado quando acesso de escrita estiver disponível. Registro final separa implementado, validado e dependências externas.

## 12. Evolução de Arquitetura, Estética e Recursos Pro (v2)

1. **Direção visual Spotify + Solo.io + One UI / iOS:** superfícies arquitetônicas Obsidian/Claro com `color-mix(in oklab, ...)`, anéis concêntricos vetoriais no hero e no card de liderança `#1`, tipografia `Plus Jakarta Sans`, pílulas translúcidas e ícones vetoriais `lucide-react` (zero emojis na interface).
2. **Adaptação cirúrgica para Samsung Galaxy S Ultra (`320px` a `412px` CSS / DPR `3.75`):** navegação inferior flutuante de 5 itens com rótulos curtos sem truncamento (`Início`, `Charts`, `Estúdio`, `Acervo`, `Ajustes`), seletor de ano em pílulas deslizáveis, seletor de semana em duas linhas sem abreviar controles, e tabela ZeroCharts responsiva via `@container (width < 680px)` convertida em cartões nativos.
3. **Motor Canvas 60fps sem re-render React por quadro:** `ChartCanvasHandle` imperativo (`drawAt`), cache assíncrono em GPU via `createImageBitmap`, contexto `2d` com `{ alpha: false }`, matrizes semanais pré-indexadas por `WeakMap`, e dois modos de vídeo:
   - **Linhas (Billboard Chart History):** curvas Bézier monotônicas, escala Top 100/50/30/20/10, troca direta de posição sem efeito roleta, coroa dourada + confetes no `#1` e pulso neon + estrelas na entrada do Top 10.
   - **Barras (Corrida estilo YouTube):** barras horizontais de reproduções acumuladas ou semanais com ultrapassagens suaves, capas circulares na ponta e marca-d'água de ano.
4. **Recursos além do Last.fm:** proxy serverless `/api/itunes` para enriquecimento conservador de capas ausentes (600×600) e prévias de áudio de 30s no `MiniPlayer` flutuante; gerador de **Card Top 10 Semanal (PNG 1080×1350)**; **Recordes & Certificações pessoais** (Prata, Ouro, Platina, 2× Platina e Diamante); **Pulso de Audição** semanal interativo; e **Mesclagem auditável e reversível de edições/aliases** sem alterar scrobbles brutos.
5. **APIs Web modernas:** `Temporal` (`@js-temporal/polyfill`) para fuso e horário de verão exatos, `document.startViewTransition` para trocas de aba fluidas, e `<dialog closedby="any">` nativo na top-layer com `@starting-style` e `transition-behavior: allow-discrete`.
