# Sincronização, celular e conexões — 03/11/26

## Diagnóstico

O botão principal conectava o Last.fm baixando apenas as últimas oito semanas. O indicador do arquivo mostrava a cobertura de todo o calendário: 8 de 541 semanas = aproximadamente 1%. Essa cobertura não era o progresso de uma importação completa. Reproduzido no Opera de produção; o comando de histórico completo chegou a 541/541 semanas.

A interface também usava `coverage-top`, mas o CSS definia `coverage-card-head`. Por isso, título e porcentagem ficavam sem o alinhamento previsto.

Além dessa ambiguidade, o fluxo tinha fragilidades para celular: recálculo e transferência de todos os charts a cada 420 ms, cópias repetidas de cada passo de trajetória e uma nova conexão IndexedDB por operação. Uma semana com erro interrompia a fila inteira.

## Comportamento corrigido

- Conectar ou continuar pelo botão principal preenche o arquivo completo. Depois, atualizar recentes consulta só oito semanas. O botão do arquivo informa quantas semanas faltam.
- O progresso conta somente as semanas deste download e informa páginas recebidas. A cobertura do aparelho aparece em cards separados, com explicação explícita.
- Falhas temporárias de uma semana não impedem as demais. Há uma segunda passagem nas semanas pendentes; persistindo o erro, o app informa o que foi salvo e permite retomar. Credenciais inválidas e falhas de armazenamento interrompem sem anunciar sucesso.
- Semanas históricas com corte incompleto são consultadas novamente. Importações exclusivamente Spotify/YouTube não são tratadas como semanas Last.fm já sincronizadas. O marcador é preservado nos backups.
- A conexão IndexedDB é reutilizada. Trajetórias compartilham passos imutáveis, preservando snapshots históricos sem multiplicar objetos. Charts são recalculados ao terminar ou pausar; o contador de semanas salvas continua atualizando durante a transferência.
- Datas visíveis e CSV usam dd/mm/aa, inclusive os dois anos de uma semana que cruza dezembro/janeiro. Horários usam HH:mm de 24 horas no fuso configurado. Identificadores de semanas, limites Unix e datas internas dos backups permanecem em formatos de máquina para preservar compatibilidade.
- O campo de calendário exibe o formato brasileiro independentemente do idioma do navegador.

## Conexões de streaming

O caminho principal explica como ativar scrobbling Spotify → Last.fm ou importar dados oficiais. Os guias têm etapas, links e nomes dos arquivos. Configurações de desenvolvedor ficam fechadas em opções avançadas.

Client ID é o identificador público do aplicativo registrado no provedor; não é senha nem Client Secret. O código já aceita `VITE_SPOTIFY_CLIENT_ID` e `VITE_GOOGLE_CLIENT_ID` configurados pelo responsável pelo deploy, além de configuração local avançada. Sem um app registrado/permitido pelo provedor, não se anuncia que o login está habilitado.

Spotify usa a tela oficial de autorização com PKCE para faixas recentes. Isso não recupera anos de histórico. Google identifica a conta; a API YouTube não disponibiliza o histórico de audição. Portanto, login Google não substitui Takeout e não cria reproduções. O login Google solicita somente identidade (`openid profile`).

## Validação

- TypeScript, build de produção e 57 testes passando. A descoberta de testes está limitada à pasta `src`, excluindo cópias de upload em artefatos locais.
- Regressões cobrem retomada, corte incompleto, falha temporária, falha persistente, chave inválida, cancelamento, preservação de Spotify, distinção de cache Last.fm, snapshots imutáveis e calendário brasileiro/24 horas.
- Opera em 320, 360, 384, 412 e 430 px: largura do documento igual à viewport; cards sem overflow e porcentagens separadas do texto.
- Pausa em 41 semanas, recarga do aplicativo e retomada das 500 semanas restantes verificadas pela interface, preservando o banco local.
- A versão corrigida terminou em **541/541 semanas**, com cobertura recente e completa em **100%**, em viewport móvel de **384 × 854 px** e CPU simulada **4× mais lenta**. Charts concluídos e console sem erros ao fim do download.

Emulação de dimensões e redução de velocidade da CPU não equivalem a teste em um Galaxy físico. Login OAuth com provedores reais requer o Client ID registrado e consentimento da conta; não foi declarado validado sem esses requisitos.

## Referências oficiais

- [Last.fm: paginação, limites e timestamps de user.getRecentTracks](https://www.last.fm/api/show/user.getRecentTracks)
- [Spotify: autorização com PKCE](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow)
- [Spotify: cadastro de aplicativos e Client ID](https://developer.spotify.com/documentation/web-api/concepts/apps)
- [Spotify: conteúdo dos pacotes de dados](https://support.spotify.com/br-pt/article/understanding-your-data/)
- [Google: exportação de dados pelo Takeout](https://support.google.com/accounts/answer/3024190?hl=pt-BR)
- [YouTube: histórico não acessível pela API](https://developers.google.com/youtube/data/revision_history)
