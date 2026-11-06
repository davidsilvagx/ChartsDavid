# Acesso obrigatório · 06/11/2026

- [x] Tela musical de entrada, cadastro e recuperação; navegação e cálculos do app não montam antes da sessão verificada pelo provedor.
- [x] Login persistente validado com `getUser`; dados locais antigos preservados no espaço convidado e migração opcional ao entrar; a escolha persiste durante a confirmação de e-mail, vinculada ao mesmo endereço e por até uma hora.
- [x] Política Supabase aplicada: 12 caracteres, maiúscula, minúscula, número e símbolo. Frontend também limita a 72 bytes UTF-8, aceita colagem/gerenciadores e exibe critérios; login de contas existentes mantém compatibilidade.
- [x] APIs Vercel, proxies alternativos e preview local exigem Bearer validado pelo Auth remoto; token ausente, inventado, conta anônima e falha do provedor não concedem acesso. Cron mantém o segredo próprio.
- [x] Respostas autenticadas não são armazenadas em cache público; token só é anexado às APIs da mesma origem. Storage e banco privados continuam com RLS por UUID.
- [x] CSP restringe scripts, objetos, formulários e enquadramento; HTTPS com HSTS. Sem chaves administrativas no cliente.
- [x] Sidebar revela painel com recorte, sem animar largura do conteúdo/gráficos. Modal Last.fm contém o fundo decorativo, que media 96dvh e criava área de rolagem sem conteúdo.
- [x] 219 testes, TypeScript e build aprovados; chamadas HTTP diretas sem sessão e com token forjado negadas nas seis APIs; 25 tentativas com JWT sem assinatura, papel administrativo inventado, expiração, chave pública usada como token, troca de métodos e parâmetros de identidade foram negadas; senha sem classes exigidas rejeitada pelo Auth remoto.

A autenticação usa o provedor existente em vez de criar um sistema de senhas próprio. Proteção contra senhas vazadas exige plano pago no Supabase e não foi ativada; MFA/CAPTCHA e limites adicionais no firewall são evoluções, sem contratação nesta entrega. O provedor já aplica limites aos fluxos de autenticação. Monitorar uso e dependências continua necessário.

Nenhuma aplicação pode garantir proteção contra todas as técnicas de invasão. O JavaScript e os dados já baixados para um aparelho controlado pelo usuário podem ser inspecionados; esconder botões ou bloquear o console não cria segurança. A fronteira real é a validação de identidade nas APIs e a autorização dos dados no servidor. A validação inicial precisa de conexão; falhas mantêm o acesso fechado e os dados locais preservados.

Referências: [senhas](https://supabase.com/docs/guides/auth/password-security), [Auth](https://supabase.com/docs/guides/auth), [RLS de arquivos](https://supabase.com/docs/guides/storage/security/access-control). Publicação e validação de produção acompanhadas no pull request desta entrega.
