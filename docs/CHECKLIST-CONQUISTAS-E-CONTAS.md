# Conquistas pop e contas — novembro de 2026

Base preservada: `c84c382` (convidado, duelo pop e trilha sonora) e `ef69afc` (QR/link, sincronização e tema do sistema).

- [x] Comparar commits e criar branch a partir da base atual.
- [x] 1. Selos coloridos, arte por missão, fotos de artistas e exportação; manter os 280 IDs e acrescentar 150 missões criativas.
- [x] 2. Corrigir alinhamento e tamanho da lupa mobile.
- [x] 3. Celebração animada de novos desbloqueios, fila e memória por perfil, sem avalanche na importação inicial.
- [x] 4. Unificar a cor da barra de atalhos com o topo e o tema.
- [x] 5. Conta real: cadastro, confirmação, login, recuperação e saída; dados privados e sincronização entre aparelhos, inclusive chave de API.
- [x] Sidebar recolhida por padrão a partir de 768 px, ícones acessíveis, expansão pelo logo e recolhimento por clique/Escape.
- [x] Validar concorrência, isolamento de contas, offline e recuperação sem sobrescrever histórico.
- [x] Executar testes automatizados, TypeScript e build.
- [x] Testar no Opera em celular, tablet e desktop (emulação; aparelhos físicos ainda precisam de validação).
- [ ] Commit, push, merge e deploy; validar produção.

## Evidências até aqui

- 215 testes automatizados passando, incluindo os 200 da base original; TypeScript e build aprovados.
- SQL executado no Supabase: isolamento de duas contas, escrita em pasta alheia bloqueada, revisão atômica, conflito de revisão antiga e acesso anônimo negado; fixtures revertidas por transação.
- Opera mobile 390×844: lupa e texto com centro vertical em 442 px; sem overflow horizontal.
- Selo com 50/100 reproduções: recorte de 50%, foto parcialmente colorida e exportação PNG 1080×1080 conferida.
- Celebração apareceu ao passar de 10 para 50 reproduções; nova abertura não repetiu desbloqueios históricos.
- Benchmark sintético do worker compilado: 104.000 reproduções, 430 missões, 5.740 ms neste Mac; não representa medição em aparelho Android/iOS. Cálculo compartilhado entre coleção e celebração.
- Conta gratuita do Brevo criada via Google do David; SMTP configurado no Supabase. Confirmação e recuperação de senha entregues à conta de QA. Nenhuma assinatura paga contratada.
- Restauração de 50 plays sintéticos em outra origem sem importar arquivos, tema propagado entre sessões, mudança offline enviada ao reconectar e saída restaurando o convidado.
- RPC com revisão antiga retorna HTTP 409 (`PT409`) em vez de disparar novas tentativas internas do PostgREST. Senha fraca rejeitada pelo servidor.
- Fingerprint do histórico normaliza chaves locais, fonte Last.fm e serialização, evitando reaplicações do mesmo arquivo.
- Sidebar conferida em 768 e 1024 px, recolhida e expandida; coleção em 1440 px e busca em 390 px, sem overflow horizontal.
