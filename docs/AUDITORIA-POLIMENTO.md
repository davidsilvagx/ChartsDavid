# Auditoria e polimento — 3 de novembro de 2026

Base revisada: main 4f132b8, precedida por 89346ea, b4e4e3c e e0eae1a. React 19, TypeScript, Vite, IndexedDB, worker de rankings e APIs serverless Vercel. Projeto permanece isolado em ChartsDavid.

## Correções

- Header acompanha a rolagem, controle de tema compacto, tipografia alinhada à marca e capa do líder com blur e fade na parte superior.
- Hall de Recordes: cards e linhas respeitam a largura disponível; métricas podem quebrar de linha, sem corte horizontal.
- Competidores: ação explícita “Desmarcar todos”; swatches de cores circulares completos em WebKit/Chromium e Firefox.
- Controles do estúdio inicialmente fechados em modal com rolagem própria, evitando alterações acidentais ao navegar pela página.
- Crédito William Santos no rodapé, nos frames/vídeos e nos cards compartilháveis. PNG e novo PDF usam o mesmo design com capa do líder.

## Auditoria da implementação anterior

- MusicLoader está ligado aos estados de conexão/sincronização e exportação; progresso deriva de semanas realmente salvas. useData recebe semanas incrementalmente, com lote de atualização de 420 ms. Testes cobrem avanço entre semanas, conclusão e erro sem falso sucesso.
- Estúdio já possui busca inline, visão normal/widescreen e expansão. Esses recursos foram preservados.
- Spotify PKCE usa Client ID configurado pelo dono da aplicação, redirect URI autorizado e permissões do provedor; consulta de recentes é limitada a 50 itens na implementação atual. Agora uma falha na leitura de recentes é erro visível, não sucesso vazio. Importação JSON permanece alternativa para histórico extenso.
- Falha crítica corrigida: callback Google buscava likes e fabricava timestamps espaçados quatro minutos, contaminando charts. Agora o login identifica apenas a conta e não produz reproduções. Histórico YouTube Music requer Takeout com horários reais. Não é possível verificar OAuth ponta a ponta sem Client IDs e consentimento das contas dos provedores.
- Fontes combinadas podem conter o mesmo play importado do Spotify/Takeout e também scrobblado pelo Last.fm. Não inferir origem dos scrobbles Last.fm nem prometer deduplicação aproximada automática. Filtros individuais permitem auditar cada fonte.
- Se likes foram importados pela versão anterior, os registros antigos não têm metadados que permitam separá-los de dados reais com segurança. Em Conexões, o usuário pode desconectar/limpar a fonte YouTube Music e reimportar o Takeout; não apagamos histórico silenciosamente.

## Validação

TypeScript, Vitest e build de produção. Opera com histórico real de Iknowjauregui, largura de 384 px e medições de scrollWidth/clientWidth dos cards. Emulação de navegador não substitui teste físico no Galaxy. Vercel já está conectado a main; o painel indica que push nessa branch atualiza produção. Publicação usa a sessão David no Opera para preservar a conta gh existente.

Fontes oficiais: https://developer.spotify.com/documentation/web-api/reference/get-recently-played e https://developers.google.com/youtube/v3/docs/channels (API sem acesso a histórico de visualização).
