# Entrada em etapas · 06/11/2026

- [x] Login, e-mail do cadastro, senha, código e confirmação em telas separadas, com transição lateral e foco acessível.
- [x] Cartão central no celular, logo e avatar musical, sem o texto grande externo; tablet e desktop preservam a composição em duas colunas.
- [x] Metadados iniciais e área segura escuros; a tela de entrada atualiza o tema do sistema antes de abrir o aplicativo. O comportamento final da barra depende do navegador/SO.
- [x] Mensagens de senha em linguagem comum, sem unidade técnica; restrição interna do provedor preservada.
- [x] Confirmação por código usa cliente isolado sem persistência ou renovação automática; não entra na sessão principal. Depois, há botão para voltar ao login.
- [x] Senha e código não entram no backup; código incorreto não libera o app, e conta não confirmada não recebe sessão no login.
- [x] Carregamento com vinil e equalizador; animação de entrada e tour na primeira abertura de cada conta, com respeito à redução de movimento.
- [x] Atualização das outras abas ao trocar o espaço da conta, evitando conflito com versões antigas abertas. Respostas dos adaptadores alternativos também ficam sem cache público.
- [x] 221 testes automatizados e TypeScript/build aprovados.

O modelo `supabase/templates/confirmation.html` foi aplicado em Authentication → Emails → Confirm sign up, com assunto em português. A entrega real do novo modelo foi confirmada após a expiração do cache do Auth. Referências: [configuração do Auth](https://github.com/supabase/auth/blob/master/internal/conf/configuration.go), [diagnóstico de modelos](https://supabase.com/kb/troubleshooting/email-template-not-updating).

- [x] Opera: login e senha do cadastro sem overflow em 320×568, 390×844, tablet 1024×900 e desktop 1440×900; sem navegação do app antes da autenticação.
- [x] Cadastro real: login antes da confirmação negado; código incorreto negado; código recebido por e-mail validado sem entrar automaticamente; botão de retorno ao login, entrada explícita com senha, animação musical, tour e saída funcionando.
- [x] Metadados de cor escuros nas telas de entrada. A barra física de Android/iPadOS ainda depende de validação nesses dispositivos.
- [x] Versão beta centralizada, scripts de avanço e validação no CI; teste isolado rejeitou mudança de produção sem versão e lançamento major sem opção explícita.
