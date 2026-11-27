# Deploy automático

O workflow `.github/workflows/ci.yml` executa CI em pushes e pull requests.
Somente push na **main**, ou execução manual selecionando **main**, libera o
job de publicação. Uma branch de trabalho ou PR nunca recebe credenciais de
publicação por esse job. Main é a branch principal deste repositório.

## Fluxo

1. Instalar dependências pelo lockfile, executar testes unitários e integração
   com DynamoDB Local, build web, pacote Lambda e check TypeScript do Pulumi.
2. Guardar o frontend e o zip exatos desse commit como um artefato de curta
   retenção. A promoção não recompila a aplicação.
3. Autenticar na conta AWS esperada e no backend Pulumi existente.
4. Gerar e validar um plano de dev, aplicar esse plano e testar frontend,
   sessão pessoal, dashboard e logout pela Function URL existente.
5. Gerar e validar um plano de prod, aplicar o mesmo pacote e testar frontend,
   saúde da API, provedor Google e bloqueio do login de desenvolvimento.

Os testes cloud comparam os nomes JS/CSS publicados com os arquivos do build.
Eles não substituem o login Google interativo ou a validação de entrega de push.
Falha em testes ou dev impede a promoção; falha após aplicar prod marca o
workflow como falho e exige revisão. Não há rollback destrutivo automático.
Deploys não são cancelados no meio por um push novo e não rodam em paralelo.

## Ativar

Em GitHub → Settings → Secrets and variables → Actions, cadastrar:

| Secret                | Finalidade                                                      |
| --------------------- | --------------------------------------------------------------- |
| AWS_ACCESS_KEY_ID     | Identidade AWS de deploy existente                              |
| AWS_SECRET_ACCESS_KEY | Credencial correspondente                                       |
| AWS_SESSION_TOKEN     | Somente se a credencial AWS for temporária                      |
| PULUMI_ACCESS_TOKEN   | Acesso à organização riedel-gabriela-org e às stacks existentes |

Secrets de Codespaces **não** são disponibilizados ao Actions. Não copie os
valores para o código, logs, documentação ou chat. Use o formulário de secrets.
Se os valores já estão no Codespace, é possível copiá-los sem exibi-los:
autorizar o GitHub CLI com uma identidade capaz de gravar os secrets de Actions
e executar `node scripts/configure-actions-secrets.mjs` na raiz. O script usa
stdin e criptografia do GitHub CLI; não imprime os valores. Ele ignora o token
automático do Codespace, que recebeu 403, e exige login próprio do CLI.
O workflow não usa Client Secret Google: produção continua lendo o segredo
existente no Secrets Manager pela execution role da Lambda.

As credenciais devem operar somente na conta 672791231338 e região us-east-1,
com acesso às stacks riedel-gabriela-org/autokeep/dev e prod. O workflow
reutiliza a identidade de deploy; não cria usuário, chave, role ou serviço AWS.
A revisão completa das políticas dessa identidade continua pendente porque a
consulta IAM foi negada. Migração futura para OIDC com role restrita pode
eliminar as chaves estáticas; exige uma configuração IAM própria e revisada.

O job usa o environment `production`. Se forem configuradas restrições de
branch nesse environment, permitir somente main. Os secrets podem ser
cadastrados nesse environment em vez do repositório; restrições/revisores do
GitHub podem exigir liberação adicional conforme as configurações existentes.

O CD foi validado em 27/11/2026 na execução [#24](https://github.com/riedel-gabriela/autokeep/actions/runs/46082027407),
commit `6f28a33` da main: verificação e deploy dev/prod aprovados.
Para repetir, usar Actions → CI e deploy → Run workflow → main.

## Limite das alterações automáticas

`scripts/deploy.mjs` permite apenas atualização do código/hash e do metadado calculado lastModified da Lambda
existente e criação/atualização/remoção dos objetos estáticos gerados no bucket
de produção. Substituições, novas infraestruturas, configurações da Lambda,
permissões, DNS, tabelas e alterações de provider bloqueiam a publicação.

O plano validado é o mesmo usado pelo `pulumi up --plan`. Planos ficam em
arquivos temporários, sem `--show-secrets`, e não são publicados como artefato.
Mudanças de infraestrutura devem passar por preview/revisão manual no Codespace,
com aprovação prévia para recursos pagos, antes de retomar o CD.

Isso evita criar novos serviços por um deploy de aplicação; não é um teto
financeiro. Chamadas e armazenamento dos recursos existentes ainda podem
consumir créditos. Conferir Billing periodicamente. Não foi criado serviço
AWS adicional para o CD.

## Comandos equivalentes no Codespace

Após gerar e testar os artefatos conforme o README, a partir da raiz:

```sh
node scripts/deploy.mjs dev
node scripts/cloud-smoke.mjs dev "$(pulumi -C pulumi-start-aws stack output appUrl --stack dev)"
node scripts/deploy.mjs prod
node scripts/cloud-smoke.mjs prod https://autokeep.negoci.online
```

Para mudanças de infraestrutura bloqueadas pelo guard, seguir o procedimento
manual do [guia Pulumi](../pulumi-start-aws/README.md). Não remover o guard ou
usar destroy como forma de contornar uma falha.
