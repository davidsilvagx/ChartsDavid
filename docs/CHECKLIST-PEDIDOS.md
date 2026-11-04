# Checklist de pedidos do usuário — LastChart / ChartsDavid

Registro único de todos os pedidos, do primeiro ao último, para nada ser esquecido. Marcado só com implementação **e** teste. Testes no Opera 137 (instância isolada, emulação de celular/tablet/computador); não houve teste em aparelho físico.

## 1 · Projeto, contas e publicação

- [x] Projeto isolado dos demais; memórias do Claude só na pasta deste projeto
- [x] Commits, PR e merge com a conta **davidsilvagx** (configuração do gh isolada, sem tocar na conta do usuário nem no Keychain)
- [x] Testes no Opera; deploy pelo Vercel; validação da URL de produção
- [x] Deslogar o David do GitHub ao terminar (entrega 1; repetido na entrega 2)

## 2 · Backlog F01–F08 (entrega 1, PR #8)

- [x] F01 sincronização entre aparelhos (cifrada; produção aguarda Upstash na conta Vercel do David)
- [x] F02 comparação de perfis
- [x] F03 metadados, gêneros e lançamentos com fonte e confiança
- [x] F04 tempo ouvido com cobertura explícita
- [x] F05 notificações opcionais de marcos
- [x] F06 áudio automático (biblioteca local) mantendo o manual
- [x] F07 categorias com os nomes do Grammy (100, edição 2027)
- [x] F08 cerimônia com suspense, cortinas e confetes
- [x] Tarefas atualizadas com evidências reais em `docs/EVOLUCAO-2026-11-04.md`

## 3 · Visual e fluidez (entrega 1)

- [x] Estilo blur com capa do álbum em todos os menus
- [x] Barra de status (relógio/câmera/bateria) com a mesma cor do topo do app
- [x] Fluidez: nada animando em repouso, menos desfoque no celular, telas pesadas sob demanda
- [x] Barras de rolagem ocultas em todo o app

## 4 · Entrega 2

- [x] Ícone do PWA novo e musical (vinil + linha de chart rumo ao #1), favicon, ícone Apple e marca do cabeçalho
- [x] Tablet e computador com todos os recursos, sem overflow nem erros em 7 tamanhos; Spotlight mais largo e em duas colunas
- [x] Júri automático: 6 jurados internos com critérios públicos (Borda), resultado lacrado até a cerimônia
- [x] Você escolhe X músicas/álbuns de uma categoria e o júri decide entre eles (modo híbrido), com deliberação dramática na cerimônia
- [x] Júri baseado em dados reais: reproduções, tempo ouvido, chart semanal, constância, ascensão e gênero verificado; abstém-se sem dados
- [x] Categorias coerentes: obras lançadas na janela do período; Artista Revelação só com estreia nos últimos 4 anos e até 3 álbuns (ex.: estreia em 2008 com 7 álbuns fica de fora)
- [x] “Seu perfil musical”: 16 perfis em 4 eixos, selos (relógio, intensidade, maratona, gênero, popularidade), relógio de audição; semana, mês, ano ou tudo
- [x] Signo musical com árvore de habilidades estilo RPG (6 habilidades, níveis 1–5, motivo de cada uma)
- [x] Emblemas próprios para os 16 perfis, avatares dos jurados e animações de entrada curtas (sem loop; respeitam movimento reduzido)
- [x] Comentários dos jurados e manchetes da “Imprensa LastChart” (ficção sinalizada, só com números reais): noite da premiação, semana nos Charts e tela de cada item
- [x] Prévia de álbum toca uma faixa do próprio álbum (mostra qual); sem prévia no catálogo, o botão some; crédito “cortesia do iTunes”
- [x] Ícones do menu redesenhados; nova aba Extras; Ajustes no topo do celular; nenhum recurso removido
- [x] Instruções “o que é e como usar” em cada recurso de Extras
- [x] Tela do artista/álbum/música com conquistas: semanas em #1, Top 10, pico, certificação e prêmios pessoais (vitórias e indicações; no artista, as obras dele)
- [x] Outras pessoas usam com o próprio Last.fm: tutorial de 4 passos, link de convite (`?convite=1`) e compartilhamento
- [x] Comparação de até 5 perfis: duelo, matriz de afinidade, dupla mais parecida, parada do grupo, o que todos ouvem e quem ouviu primeiro
- [x] TypeScript, 155 testes e build; testes no Opera em celular (retrato/paisagem), tablet, computador e temas claro/escuro

## 5 · Entrega 3 · “avançar com tudo que falta”

- [x] Armazenamento de sincronização em produção: **Vercel Blob privado** `charts-david-sync` (região gru1, São Paulo) criado na conta do David e conectado ao projeto; revisão atômica por ETag; testado com dois contextos contra o Blob real (projeto + 2 trechos de áudio, só bytes cifrados na nuvem)
- [x] Notificações com o app fechado: Web Push (VAPID) + Cron diário do Vercel (`/api/push-cron`, 19h de Brasília) consultando o Last.fm de cada assinante; novo #1 da semana e recorde semanal; assinatura salva no Blob; remoção automática de assinaturas expiradas
- [x] Carreira e Grammys oficiais: MusicBrainz (estreia, álbuns de estúdio) e Wikidata (vitórias e indicações); seção na tela do artista/álbum/música; escolha entre homônimos; Artista Revelação exclui quem já concorreu
- [x] Trilha automática testada com uma música real (MP3 de 3:19 com etiquetas ID3): associação automática, decodificação parcial e áudio presente no vídeo exportado
- [x] Variáveis no Vercel: `BLOB_READ_WRITE_TOKEN`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `CRON_SECRET` (produção, preview e desenvolvimento)
- [x] Dependências do servidor sem vulnerabilidades (`npm audit --omit=dev`)

## Limites conhecidos

- Carreira e Grammys vêm de bases públicas e colaborativas (MusicBrainz/Wikidata), que podem estar incompletas; a elegibilidade continua sendo uma estimativa, não a regra oficial.
- Áudio automático usa arquivos do próprio usuário; prévias de catálogo não são sincronizadas com vídeo (regra da Apple).
- Push com o app fechado: 1 verificação por dia (limite do Vercel Hobby). Testado até o serviço de push do Google aceitar a mensagem (HTTP 201); o Opera de computador não a exibiu e o serviço invalidou a assinatura (removida pelo servidor). A exibição no aparelho ainda precisa ser confirmada no celular Android (Chrome/Opera) ou no PWA do iPhone.
