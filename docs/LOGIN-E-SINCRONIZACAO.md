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

Na avaliação inicial, o login ainda não havia sido implementado. A seção “Implementação de contas” abaixo descreve a implementação posterior e substitui essa limitação.

## Tema do sistema nos tablets

O aplicativo atualiza `theme-color`, `color-scheme` e a cor do fundo sob a área segura. Também declara o modo standalone Apple e a barra translúcida. A API web não controla todas as barras do sistema: em iPadOS, o comportamento depende da versão, do modo instalado e do navegador. A validação no Opera desktop com dimensões de tablet não substitui um teste em iPad/Android físico. Referências: [Apple · meta tags](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariHTMLRef/Articles/MetaTags.html), [web.dev · melhorias em PWAs](https://web.dev/learn/pwa/enhancements).

## Implementação de contas (novembro de 2026)

Escolha: adaptar o app ao Supabase Auth + Postgres + Storage privado. Um serviço pronto cuida de senha, confirmação, recuperação e renovação de sessão; o código existente de projeto preserva os formatos e histórico. Construir autenticação própria sobre Blob exigiria assumir armazenamento de senha, recuperação, abuso e revogação de sessões; Clerk também é uma alternativa pronta, mas precisaria de um armazenamento separado e adicionaria outro fornecedor. Custos dependem de usuários ativos, espaço e tráfego; confirmar os planos atuais antes de aumentar a escala: https://supabase.com/pricing.

A chave `sb_publishable_…` é pública por definição. Não há `service_role` no cliente. As políticas de linha e de objetos restringem cada conta ao UUID da própria sessão; a gravação da revisão usa uma função com verificação de dono e compare-and-swap para evitar sobrescrever outro aparelho. Os arquivos são imutáveis e comprimidos; cada download confere SHA-256. Não é anunciado como criptografia ponta a ponta: o provedor mantém o backup privado com autorização e transporte seguro. O modo anterior com chave cifrada e QR/link permanece disponível.

Cada conta utiliza um banco IndexedDB e um conjunto de preferências próprios. Ao entrar, o usuário escolhe se quer levar o conteúdo do modo convidado; o original fica preservado. Ao sair, o app restaura o espaço convidado. Tokens de Spotify/Google e senhas não entram no backup. A chave Last.fm entra deliberadamente no backup privado, atendendo ao pedido de continuidade entre aparelhos. Os áudios são sincronizados por hash, sem misturar contas.

A sincronização compara alterações com a última base, combina históricos compatíveis sem duplicar plays e pede uma escolha quando o mesmo ajuste muda nos dois aparelhos. Alterações offline permanecem no IndexedDB e são reenviadas ao reconectar. O backup tem limite de 64 MiB comprimidos; acima disso a UI mantém os dados locais e informa a limitação. Arquivos de revisões anteriores permanecem privados para recuperação e poderão precisar de uma política de retenção conforme o uso crescer.

Requisitos de produção: executar `supabase/migrations/202611060001_account_snapshots.sql`, manter confirmação de e-mail, configurar URLs de retorno da produção/localhost de desenvolvimento e SMTP próprio. O SMTP padrão do Supabase restringe destinatários aos membros do projeto e não é indicado para produção: https://supabase.com/docs/guides/auth/auth-smtp. O fluxo PKCE requer abrir o link de recuperação no navegador em que ele foi solicitado; em outro aparelho, peça um novo link naquele navegador.

Configuração aplicada: migrações 001 e 002, confirmação obrigatória, senha mínima de 12 caracteres, URLs exatas de produção e desenvolvimento, SMTP Brevo e remetente verificado. Confirmação e recuperação tiveram entrega real em QA. O remetente gratuito usa reescrita de domínio do Brevo; domínio próprio continua uma evolução possível. A chave SMTP deve ser renovada antes da validade exibida pelo provedor e pode expirar por inatividade. Nenhuma chave privada foi adicionada ao repositório.

A revisão conflitante usa `PT409`: o código `40001` é reservado a falhas de serialização e provocava repetição interna no PostgREST 14. O teste HTTP confirmou resposta 409 rápida após a correção. Referência: [Supabase · retries com códigos customizados](https://supabase.com/kb/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions).
