# Evolução do LastChart · 06/11/2026

Cada item só recebe [x] após implementação e verificação. Dependências externas e limites dos testes ficam registrados aqui.

- [x] 01. Sidebar: vidro, hierarquia, navegação em tablet/desktop e movimento reduzido.
- [x] 02. Perfil: linguagem simples, personalidade pop e estados vazios corretos.
- [x] 03. Meu eu do passado: comparar períodos, mudanças e permanências com cobertura explícita.
- [x] 04. Persistência: incluir reproduções e preferências no backup cifrado entre aparelhos.
- [x] 05. Conquistas: mais de 200 missões, critérios, progresso, coleção e exportação/compartilhamento.
- [x] 06. Tema: cores do navegador/sistema em tablets, respeitando limitações do sistema operacional.
- [x] 07. Acervo: posições, grid/lista e mesma ordem de reprodução.
- [x] 08. Charts & prêmios: categorias anuais adicionais e preferência global de duração.
- [x] 09. Live Charts: semana aberta isolada, atualização e comparação com o último fechamento.
- [x] 10. Semanas abertas: excluir de históricos, perfis, prêmios, vídeos e cálculos consolidados.
- [x] 11. Tutorial: apresentação dos recursos, conclusão persistente e acesso manual.
- [x] 12. Instalação: pop-up dispensável, instalação mantida nos ajustes.
- [x] 13. Grids: investigar e corrigir espaços extras em perfil e premiação no tablet.
- [x] 14. Imagens: retrato do artista separado da capa de música/álbum.
- [x] 15. Login: avaliar pronto/adaptar/criar, requisitos, esforço e custos com fontes atuais.
- [x] 16. Mobile: atalhos acessíveis e personalizáveis sem rolagem longa.
- [x] 17. Vídeos: manter, acelerar, compactar ou pular ausências de forma opcional.

## Entrega e validação

- [x] TypeScript, 199 testes de regressão (26 arquivos) e build de produção.
- [x] Opera real: fluxos principais em 390×844, 768×1024, 1024×768 e 1440×1000.
- [ ] Commits, merge em main e push.
- [ ] Deploy Vercel e verificação do endereço publicado.

## Constatações iniciais

- Projeto React 19 + Vite + TypeScript, IndexedDB, APIs serverless e sincronização AES-GCM existente.
- A sincronização original preserva preferências e áudio, mas exclui scrobbles; isso não atende ao histórico entre dispositivos.
- `Week.partial` já identifica semanas abertas, mas a separação não era aplicada em todos os consumidores.
- Login Spotify/Google atual conecta plataformas; não autentica uma conta do LastChart.


## Evidências da implementação

- Semana aberta isolada no Worker: só o Live recebe o último período. Acervo, contagens, perfil, júri, notificações, histórico e vídeos consomem semanas encerradas. O calendário vira automaticamente na próxima sexta; um cache salvo como parcial só é promovido após conter o fechamento completo, sem transformar rascunhos em resultados oficiais.
- Live: atualização manual ou opt-in a cada 2 minutos com a tela visível. É uma prévia consultada no Last.fm, sem promessa de streaming instantâneo ou de posições definitivas.
- Conquistas: 280 IDs únicos (180 de fandoms, 36 de gêneros, 24 de décadas e 40 de marcos/hábitos/tempo), cálculo em Worker, progresso, filtros, PNG 1080×1080, SVG e compartilhamento nativo com imagem quando suportado.
- Meu eu do passado: blocos de 1, 4, 13 ou 52 semanas; cobertura explícita; comparação por participação de artistas. Ausência em um bloco não é chamada de estreia no histórico inteiro.
- Categorias anuais: músicas diferentes em #1 por artista, plays de artistas/álbuns, estreias confirmadas, pico de músicas simultâneas com títulos e álbuns, revelação pela estreia no Top 100 pessoal. Estreias nunca são afirmadas através de lacunas de download.
- Duração: preferência persistente, disponível nos Ajustes; conversão de apresentação em tabelas, detalhes, recordes e cards. Totais, regras e ranking mantêm semanas exatas. Meses/anos exibem aproximação.
- Fotos: endpoint de catálogo com correspondência exata, cache e separação entre retratos de artistas e capas. Arte de álbum não é usada como fallback para artista; indisponibilidade mantém o ícone neutro.
- Grids: removido o span de duas linhas do signo e desativados placeholders de `content-visibility` nos cards dos diálogos. A cédula mantém os oito cards visíveis nas duas orientações de tablet; perfil e prêmios sem overflow horizontal nos testes.
- Tutorial: seis slides, conclusão em chave própria (independente de settings ou URL de convite), reabertura manual nos Ajustes/Extras/sidebar. Instalação vira pop-up dispensável; botão permanece nos Ajustes.
- Sincronização: histórico gzip/AES-GCM em partes, validação de backup, integridade e retomada; preferências/metadados/favoritos incluídos. Mesclagem preserva a maior multiplicidade de reproduções sem duplicá-las a cada recebimento. [Análise de login, alternativas e custos](LOGIN-E-SINCRONIZACAO.md).

## Verificações no Opera

Ambiente isolado com fixture sintética `opera-qa`, sem alterar o perfil ou o histórico real do usuário. Artefatos locais em `output/playwright/`, ignorados no Git.

- Tutorial completo em seis etapas, encerramento salvo, reload sem repetição.
- Pop-up de instalação descartado e preferência preservada após reload.
- Importação validada de 46 semanas: 45 encerradas entram no acervo e a semana aberta só no Live.
- Grid/lista: nove músicas na mesma ordem, posições preservadas e preferência salva.
- Perfil/Meu eu do passado e cédula: desktop, tablet nas duas orientações e celular sem overflow horizontal; oito cards de votação visíveis, sem placeholders reservados.
- Catálogo de conquistas: 280 missões, filtro Little Monster com quatro níveis; PNG real baixado e validado como 1080×1080.
- Duração equivalente aplicada nos charts, com exemplo de 45 semanas exibidas como aproximadamente 10,3 meses.
- Tema claro: meta `theme-color` igual à variável da área de sistema, sem overflow em largura mobile. Retratos de artistas vindos do caminho `/images/artist/` do catálogo.
- Vídeo de Firework: manter/acelerar preservam 45 períodos; compactar usa 22; pular usa 21. Exportação real WebM concluída com ausência pulada, sem perder as datas dos retornos.

## Limites conhecidos

- Dimensões em Opera desktop não reproduzem barras de sistema de um iPad/Android físico. Ajustes de `theme-color`, área segura e metadados Apple estão implementados; validar a barra de sistema em hardware antes de prometer compatibilidade com toda versão de iPadOS/Android.
- Sincronização entre aparelhos permanece manual por chave, com cota de 64 MB compartilhada por histórico e áudio; produção requer Blob privado/Upstash configurado. A implementação de conta SSO/e-mail foi avaliada, conforme solicitado, e não simulada com uma tela sem provedor.
- Compartilhamento nativo depende do navegador/SO; PNG/SVG para download e cópia de texto cobrem o fallback.
