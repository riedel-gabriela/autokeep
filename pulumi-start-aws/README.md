# Infraestrutura existente — Pulumi

Este programa referencia recursos já existentes. Não cria nem altera tabelas,
Lambdas, permissões ou DNS. O template antigo que criava `my-bucket` foi removido.

```sh
npm ci
pulumi login
pulumi stack select dev --create
pulumi config set aws:region us-east-1
pulumi preview
pulumi stack select prod --create
pulumi config set aws:region us-east-1
pulumi preview
```

As stacks usam `autokeep-dev` / `autokeep-prod` e
`autokeep-api-dev` / `autokeep-api-prod`. `autokeep:tableName` e
`autokeep:functionName` permitem sobrescrever os nomes explicitamente.
Uma stack Pulumi não cria, por si só, um recurso AWS pago.

`Table.get` / `Function.get` são referências, não adoção do gerenciamento do
recurso. Para passar a gerenciar a infraestrutura, primeiro exporte e revise a
configuração existente, use importação explícita e `protect: true`. Não recrie
os bancos nem trate `pulumi up` como rotina de desenvolvimento.

DynamoDB: tabelas Standard, 5 RCU e 5 WCU fixos cada, chaves String `pk`/`sk`,
TTL `ttl`, sem índices, PITR, auto scaling ou chave KMS própria. Lambda existente:
Node.js 24.x, `index.handler`, memória 256 MB e timeout 15 s (prod).
Confira sempre o console antes de gerenciar configurações de outro ambiente.

Não são criados Cognito, SES, CloudFront, API Gateway ou Route 53 aqui.
Não execute deploy ou introduza consumo pago, mesmo coberto por créditos,
sem antes informar o recurso/valor e obter autorização explícita do usuário.
Registro de domínio no Route 53 não é coberto por créditos promocionais.
