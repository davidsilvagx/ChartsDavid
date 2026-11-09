# Instruções para qualquer agente que alterar este repositório

## Versões obrigatórias

- Leia `app-version.json` e `CHANGELOG.md` antes de alterar código. Preserve os commits e melhorias existentes do usuário.
- Toda entrega com alteração de comportamento, código de produção, interface ou dependências deve atualizar a versão, uma vez por entrega.
- Correção ou ajuste visual compatível: `npm run version:bump -- patch --note "Descrição curta"` (0.1.0 → 0.1.1).
- Funcionalidade nova ou mudança maior compatível durante o beta: `npm run version:bump -- minor --note "Descrição curta"` (0.1.0 → 0.2.0).
- A versão 1.0.0 e o canal estável só podem ser lançados por pedido explícito do usuário: `npm run version:bump -- major --stable --note "Lançamento oficial"`. Não promova o beta automaticamente.
- O comando mantém manifesto, package.json, package-lock.json e changelog consistentes. Não edite somente o número que aparece na interface.
- Execute `npm run version:check`, os testes adequados e o build antes de publicar. O CI rejeita alterações de produção sem avanço de versão.
- Documentação e testes sem mudança de produção não exigem nova versão. Se uma entrega já recebeu versão e ainda não foi publicada, conclua suas correções dentro dessa mesma entrega.
- O selo de versão é centralizado em `AppVersion`; preserve sua apresentação discreta.

## Envios e custo de deploy

- Prepare e teste a entrega inteira antes do envio ao GitHub. Prefira um único push com todas as alterações; não crie um commit remoto por arquivo, pois cada envio pode disparar outro build na Vercel.
- Quando a CLI não tiver escrita, use uma publicação em lote pela sessão autorizada e confirme que a árvore remota corresponde à árvore testada antes do merge.
