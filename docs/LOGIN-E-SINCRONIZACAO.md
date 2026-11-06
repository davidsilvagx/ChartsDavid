# Login e sincronização · análise em 06/11/2026

É viável oferecer e-mail/senha e entrada com Google ou Apple. O login de Spotify/Google existente serve à importação de plataformas; ele não autentica uma conta LastChart. SSO corporativo por SAML é outra necessidade, com custos e configuração próprios, e não é necessário para este aplicativo pessoal.

## O que já funciona nesta entrega

IndexedDB preserva o histórico offline. Projetos passam a incluir reproduções de todas as fontes, preferências, favoritos, atalhos, premiações e metadados. Na nuvem, o histórico é comprimido com gzip quando disponível, cifrado em AES-GCM e dividido em partes de até 3 MB. As versões são protegidas por revisão: um aparelho não sobrescreve outro silenciosamente. A chave deve ser guardada pelo usuário; sem ela, o servidor não recupera o conteúdo. O envio/recebimento é manual nos Ajustes, com retomada de partes, integridade SHA-256 e mesclagem de semanas sem multiplicar reproduções.

O backend continua usando Vercel Blob privado ou Upstash já configurado. Sem credenciais, produção responde 503 com explicação; desenvolvimento pode usar armazenamento em memória, que não é persistência de produção. A cota atual de 64 MB por chave inclui histórico e áudios; versões antigas de arquivos também ocupam essa cota até remoção/expiração do armazenamento. O arquivo de projeto é uma alternativa local, contém histórico e não é cifrado: deve ser guardado como backup pessoal. Tokens OAuth, chave pessoal de API e a chave de sincronização não entram nele.

## Comparação das alternativas

| Caminho | Implementação | Esforço estimado* | Custo e limites | Riscos e trade-offs |
| --- | --- | --- | --- | --- |
| Usar pronto: Supabase Auth + Postgres/Storage | E-mail/senha, recuperação, confirmação e Google; dados por `user_id` com RLS; fila offline e migração do IndexedDB | 5–8 dias de desenvolvimento + 2–3 de validação | Free: 50 mil MAU, 500 MB de banco, 1 GB de arquivos; pode pausar após inatividade. Pro desde US$25/mês, mais excedentes | Menos trabalho de autenticação; requer RLS testada, SMTP e migração. Banco no servidor não equivale à cifragem ponta a ponta atual. [Preços](https://supabase.com/pricing), [métodos](https://supabase.com/docs/guides/auth). |
| Adaptar: Clerk + backend de sincronização atual | Componentes de login prontos; servidor verifica sessão e associa usuário ao projeto; manter arquivo cifrado e revisões | 4–7 dias + 2–3 de validação | Autenticação gratuita até 50 mil usuários retidos mensais; armazenamento e transferência continuam cobrados à parte | Preserva maior parte do backend; vincular login à chave cifrada exige um fluxo de recuperação explícito. MAU e usuários retidos são métricas diferentes. [Plano e medição](https://clerk.com/pricing), [mudança de planos](https://clerk.com/changelog/2026-02-05-new-plans-more-value). |
| Criar: identidade própria + banco + sessões | Cadastro, hash de senha, cookies seguros, rotação/revogação, recuperação, SMTP, rate limits, OAuth e auditoria próprios | 15–25 dias + testes de segurança e manutenção contínua | Infraestrutura, banco, e-mail e monitoramento; custo depende do uso, sem estimativa artificial | Maior controle e maior superfície de falhas. Não recomendo recriar autenticação para este projeto. |

*Estimativas de engenharia para o código atual, não prazos de fornecedor. Excluem revisão de provedores, publicação nas lojas e requisitos novos. Valores em USD, sem impostos, convertidos de páginas oficiais consultadas nesta data; conferir novamente antes de contratar.

## Recomendação e requisitos

Para evoluir para uma conta com recuperação e sincronização automática, recomendo Supabase Auth + armazenamento por usuário, mantendo o IndexedDB como cache offline. Se preservar a cifragem ponta a ponta e minimizar a migração do backend for prioridade, adaptar Clerk ao backend atual é uma opção consistente.

Antes da implementação de contas são necessários projeto do provedor, domínios de produção/preview, URLs de callback, aplicativo OAuth Google/Apple e SMTP para confirmação/recuperação. A camada de dados precisa de autorização por usuário em toda rota, política de exclusão/exportação, migração de perfis locais, regras de conflito e testes com duas contas e sessões expiradas. Credenciais administrativas ficam apenas nas Functions. Senhas e tokens não podem ir para backups nem variáveis públicas do Vite.

A recuperação de senha da conta não recupera automaticamente uma chave de cifragem ponta a ponta. É necessário escolher entre dados autorizados pelo servidor ou uma chave de recuperação/encapsulamento por aparelho. Essa decisão deve estar clara no produto antes de prometer recuperação de histórico.

Login não foi adicionado nesta entrega: este item pede avaliação técnica, e uma tela sem provedor configurado simularia uma segurança inexistente.

## Tema do sistema nos tablets

O aplicativo atualiza `theme-color`, `color-scheme` e a cor do fundo sob a área segura. Também declara o modo standalone Apple e a barra translúcida. A API web não controla todas as barras do sistema: em iPadOS, o comportamento depende da versão, do modo instalado e do navegador. A validação no Opera desktop com dimensões de tablet não substitui um teste em iPad/Android físico. Referências: [Apple · meta tags](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariHTMLRef/Articles/MetaTags.html), [web.dev · melhorias em PWAs](https://web.dev/learn/pwa/enhancements).
