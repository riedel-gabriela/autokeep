# Infraestrutura AWS do AutoKeep

Pulumi mantém as stacks `dev` e `prod` em `us-east-1`, adotando as tabelas
DynamoDB e funções Lambda existentes. A stack `prod` também publica o frontend
e a API em `https://autokeep.negoci.online`.

```text
navegador → Route 53 → CloudFront → S3 privado (frontend)
                               └→ API Gateway HTTP → Lambda → DynamoDB
```

O certificado HTTPS é validado por DNS. A hosted zone existente é importada
pelo ID configurado; não crie outra zona para esse domínio.

## Pré-requisitos

- Use o Codespace com os secrets AWS e acesso ao backend Pulumi.
- Node.js/npm, AWS CLI e Pulumi disponíveis.
- Credenciais devem apontar para a conta `672791231338` e região `us-east-1`.
- Gere os artefatos na raiz do repositório antes de atualizar a stack.

Confira a identidade sem imprimir credenciais:

```sh
aws sts get-caller-identity --query '{Account:Account,Arn:Arn}' --output json
```

Se a conta não for a esperada, pare antes de aplicar.

## Atualizar produção

Na raiz:

```sh
npm ci
npm run build
npm run build:lambda
cd pulumi-start-aws
npm ci
npm run check
pulumi login
pulumi stack select prod
pulumi preview --diff
pulumi up
pulumi stack output
```

Leia o plano completo antes de confirmar `pulumi up`. A atualização normal deve
preservar a tabela e a função existentes. Se aparecer substituição ou remoção
de tabela, Lambda, role ou DNS, não confirme. O Pulumi publica os builds web e
Lambda gerados antes de entrar nesta pasta.

Confira o domínio e a API:

```sh
curl -i https://autokeep.negoci.online/
curl -i https://autokeep.negoci.online/api/health
```

Isso verifica disponibilidade básica; faça também login, gravações e teste de
isolamento antes de considerar a validação funcional concluída.

Os valores de produção estão em `Pulumi.prod.yaml`: hospedagem e domínio ativos,
origem `https://autokeep.negoci.online`. Credenciais AWS e token Pulumi nunca
devem ser versionados. No deploy de produção, o Pulumi define `AUTH_MODE=google`
e interrompe o preview se não encontrar um client ID e ARN de segredo válidos
na configuração ou na Lambda existente. O login e o cadastro por senha ficam
bloqueados; um usuário novo pode criar um espaço com Google e um usuário
existente pode vincular sua conta uma vez. Web Push segue desligado.

## OAuth Google (opcional)

OAuth requer cliente OAuth no Google Cloud e segredo do cliente no AWS Secrets
Manager, região `us-east-1`. O segredo deve guardar apenas o texto do client
secret e a policy criada pelo Pulumi limita `GetSecretValue` ao ARN informado.
Use cliente e segredo separados para `dev` e `prod`.

O Secrets Manager custa atualmente US$ 0,40 por segredo/mês, mais US$ 0,05 por
10.000 chamadas de API. Uma chamada pode ocorrer no primeiro uso após cold start.
Confirme saldo, créditos e eventual período gratuito antes de criar o segredo;
o deploy não cria esse segredo automaticamente. [Preços do Secrets Manager](https://aws.amazon.com/secrets-manager/pricing/).

Configure o ID e o ARN como valores não secretos da stack. Nunca passe o valor
do segredo no Pulumi ou no terminal:

```sh
pulumi config set autokeep:googleClientId CLIENT_ID --stack prod
pulumi config set autokeep:googleClientSecretArn ARN_DO_SEGREDO --stack prod
pulumi stack output googleCallbackUrl --stack prod
pulumi preview --diff --stack prod
```

Cadastre a saída `googleCallbackUrl` como URI de redirecionamento autorizado no
cliente Google. Revise o preview: a única permissão nova deve conceder
`secretsmanager:GetSecretValue` para o ARN especificado. Só então aplique com
`pulumi up --stack prod`. Sem essas duas configurações, OAuth fica desativado.

## Web Push agendado (opcional, dev)

O Web Push no Docker local pode usar chaves VAPID no `.env`. O processamento
agendado na AWS é limitado a `dev` e cria regra EventBridge que invoca a Lambda
a cada 15 minutos (cerca de 2.880 invocações por mês), além do consumo da Lambda
e do DynamoDB. Pode haver cobrança conforme o uso e os créditos; não habilite
sem conferir o Billing e aprovar esse consumo. EventBridge anuncia 14 milhões
de invocações mensais gratuitas para Scheduler, mas o código usa regra agendada
EventBridge e o limite não deve ser presumido como teto. [Preços do EventBridge](https://aws.amazon.com/eventbridge/pricing/).

Habilitação exige `hostingEnabled` em `dev`, `pushEnabled: true`, chaves VAPID e
`PUSH_SUBJECT`. A chave privada deve ser secreta. Gere os artefatos web/Lambda,
revise `pulumi preview --diff --stack dev` e confira criação da regra e o novo
timeout da Lambda antes de aplicar. Esta feature não é habilitada por este
deploy de produção.

## Desenvolvimento local e SAM

O Docker local usa DynamoDB Local e Mailpit, sem AWS:

```sh
cd ..
npm run dev
npm run credentials
npm run down
```

`npm run down` preserva o volume local. Para apagar os dados locais também, use
`docker compose down --volumes`. O fluxo para emular a Lambda e API Gateway com
SAM está documentado em [`../docs/sam-local.md`](../docs/sam-local.md).

## `pulumi destroy`

`pulumi destroy` remove recursos registrados na stack. Tabelas, Lambda, zona
DNS e hospedagem têm `protect` e/ou `retainOnDelete`; a operação deve falhar ao
tentar remover recursos protegidos. Não retire essas proteções para contornar o
bloqueio: isso pode apagar dados ou deixar recursos cobrando fora do estado.

Para inspecionar a stack antes de qualquer destruição:

```sh
pulumi stack select dev
pulumi stack --show-urns
pulumi preview --diff --stack dev
```

Somente considere `pulumi destroy --stack dev` se o estado revisado estiver
vazio ou se todos os recursos e dados puderem ser descartados. Não use destroy
para pausar a hospedagem. Créditos e franquias gratuitas não são teto de gasto;
verifique Billing antes e depois de qualquer alteração.
