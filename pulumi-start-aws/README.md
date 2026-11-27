# Infraestrutura AWS do AutoKeep

O Pulumi adota as tabelas `autokeep-dev`/`autokeep-prod` e as Lambdas
`autokeep-api-dev`/`autokeep-api-prod` existentes na conta `672791231338`, em
`us-east-1`. O código e ambiente das duas funções são gerenciados pela stack.

```text
dev:  navegador → Function URL da Lambda → DynamoDB dev
                  (frontend e API)

prod: navegador → Route 53 → CloudFront → S3 privado
                                     └→ API Gateway HTTP → Lambda → DynamoDB prod
```

Dev reaproveita a Function URL existente, sem criar outra distribuição, bucket,
API Gateway ou zona DNS. A produção mantém `autokeep.negoci.online`, com ACM
e registros na zona delegada existente. Não crie outra zona para esse domínio.

## Preparar e publicar

Use o Codespace com os secrets AWS e autenticação Pulumi. Não copie secrets para
o repositório, logs ou variáveis frontend. Confira a identidade:

```sh
aws sts get-caller-identity --query '{Account:Account,Arn:Arn}' --output json
```

Na raiz do repositório:

```sh
npm ci
npm test
npm run test:integration
npm run build
npm run build:lambda
cd pulumi-start-aws
npm ci
npm run check
pulumi login
```

O zip da Lambda inclui o frontend para o ambiente dev. Gere sempre ambos os
builds antes de atualizar qualquer stack.

Desenvolvimento:

```sh
pulumi preview --diff --stack dev
pulumi up --stack dev
pulumi stack output appUrl --stack dev
```

Abra a URL e clique em **Entrar**. É uma conta compartilhada de teste; não use
dados pessoais reais. `NODE_ENV=development` e `DEV_LOGIN_ENABLED=true`
habilitam o acesso simples no servidor, sem senha nem segredo OAuth de dev.

Depois de validar o ambiente de desenvolvimento, publique produção:

```sh
pulumi preview --diff --stack prod
pulumi up --stack prod
pulumi stack output appUrl --stack prod
```

A produção define `NODE_ENV=production`, `DEV_LOGIN_ENABLED=false` e
`AUTH_MODE=google`. Somente Google OAuth abre a sessão. A API também bloqueia
`POST /api/auth/dev-login`, mesmo por chamada direta.

Leia o preview completo. Substituição/remoção de tabela, Lambda, role ou DNS
exige revisão dos dados e dependências. Builds não publicam sozinhos; `up`
aplica a configuração e os artefatos gerados. Confira saldo e consumo antes e
depois de mudanças; créditos e franquias não são teto rígido de gastos.

## Deploy automático

O workflow publica o pacote validado em dev e depois em prod somente na main.
Secrets de GitHub Actions e execução real são necessários para ativá-lo. O CD
bloqueia alterações de infraestrutura e aplica somente planos de atualização
da aplicação. Veja [configuração e operação](../docs/continuous-deployment.md).

## OAuth de produção

`Pulumi.prod.yaml` referencia o Client ID e o ARN do segredo no Secrets Manager.
O valor do segredo não vai no Pulumi, terminal ou frontend. A aplicação aceita
texto puro ou JSON com uma das chaves `client_secret`, `GOOGLE_CLIENT_SECRET`
ou `autokeep/google-oauth-client-secret`. Use o segredo do mesmo cliente OAuth.
A permissão da Lambda deve ficar restrita ao ARN configurado.

```sh
pulumi config set autokeep:googleClientId CLIENT_ID --stack prod
pulumi config set autokeep:googleClientSecretArn ARN_DO_SEGREDO --stack prod
pulumi stack output googleCallbackUrl --stack prod
```

Cadastre essa URL de callback no cliente OAuth do Google. Não crie outro
segredo se o atual estiver correto. Recursos pagos adicionais exigem aprovação
com estimativa de valor e frequência antes da criação.

## Web Push opcional

A aplicação mantém Web Push opcional. O processamento agendado é restrito à
stack dev e exige habilitação explícita, chaves VAPID e `PUSH_SUBJECT`.
Não habilite `pushEnabled` sem revisar requisitos, dependências, preview e custo.
Notificações no app continuam disponíveis sem scheduler.

## Parar desenvolvimento e remover infraestrutura

Para parar somente o Docker local, na raiz:

```sh
npm run down
```

`pulumi destroy` não pausa serviços. Tabelas, funções e outros recursos têm
`protect` e/ou `retainOnDelete`; o comando pode falhar por proteção ou reter
recursos cobrando fora do estado. Não retire as proteções para contornar o erro.
A stack adota recursos existentes: não garante reconstrução de todos os dados,
roles ou recursos externos a partir de uma conta vazia.

Antes de planejar qualquer exclusão:

```sh
pulumi stack --stack dev --show-urns
pulumi preview --diff --stack dev
```

A limpeza deve conferir propriedade, dependências, dados, referência no código
e uso real na AWS. Ambientes dev/prod separados não são redundância. A remoção
de dados sem recuperação exige confirmação específica. Os comandos abaixo só
se aplicam após revisão e autorização da destruição correspondente:

```sh
pulumi destroy --stack dev
```

Não execute `destroy` em produção como procedimento de manutenção.
