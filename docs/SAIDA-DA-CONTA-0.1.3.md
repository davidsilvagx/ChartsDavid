# Saída da conta — beta 0.1.3

## Entrega
- [x] Menu no avatar com conta e backup, avatar, Last.fm e saída da conta.
- [x] Ação “Sair da conta” também nas configurações, com ícone e texto alinhados e botões empilhados no celular.
- [x] Transição de vinil e equalizador, inclusive sobre o modal de conta; respeita movimento reduzido.
- [x] Bloqueio de cliques repetidos e de novas sincronizações durante a saída; aguarda backups já em andamento.
- [x] Falhas de saída aparecem na interface, sem afirmar que a sessão foi encerrada.
- [x] Saída limitada ao aparelho atual (`scope: local`), preservando outras sessões.
- [x] TypeScript, build e consistência da versão aprovados.
- [x] Suíte de 232 testes aprovada, incluindo ordem da transição, escopo local e falha da autenticação.
- [x] Validação visual no Opera em 320, 390, 768, 1024 e 1440 px; menu sem transbordamento, Escape e foco corretos.
- [x] Saída real pelo perfil: transição em diálogo sobreposto, interface bloqueada durante a saída e retorno ao login mesmo após recarregar (workspace desmontado).
- [x] Falha de rede pelo modal da conta mantém a sessão e mostra aviso em português; backup em andamento desabilita o botão com explicação fora dele.
- [x] Tutorial com fundo estável, sem capa carregada de forma assíncrona e sem rolagem criada por camadas decorativas.
- [x] Seis etapas do tutorial conferidas; no passo 2, 622 px de conteúdo e 622 px de rolagem no tablet, antes 828 px de rolagem. Temas claro e escuro conferidos.
- [x] Tema do login e do workspace aplicado antes da pintura; telas de cadastro e recuperação continuam acessíveis.

Checklist de validação anterior à publicação. O resultado de merge e deploy deve ser conferido no PR e na Vercel após esta revisão.

## Observações
“Sair da conta” encerra a sessão LastChart; conectar ou trocar o perfil Last.fm continua sendo uma ação separada. Os backups salvos são preservados. O escopo local foi verificado no teste unitário; não foi simulada uma sessão em um segundo aparelho físico. As dimensões foram emuladas no Opera, não em hardware móvel real. A versão inclui o complemento de adiamento de backup da beta 0.1.2 que ainda aguardava publicação.
