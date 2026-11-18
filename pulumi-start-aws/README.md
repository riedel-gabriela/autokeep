# Adoção protegida da infraestrutura existente

Este projeto Pulumi prepara a adoção das tabelas DynamoDB e Lambdas existentes
em `us-east-1`. Ele não declara Route 53, API Gateway, Cognito, S3, RDS ou
outros serviços. Os arquivos `Pulumi.dev.yaml` e `Pulumi.prod.yaml` contêm
somente região, conta, nomes de recursos e roles; não contêm credenciais.

O código usa `import` para associar recursos existentes ao estado Pulumi,
`protect` e `retainOnDelete` para impedir remoções acidentais, e ignora campos
de código/configuração da Lambda que não devem ser implantados durante a
adoção. A configuração de conta/região e os nomes são verificados antes de
declarar os recursos.

## Estado confirmado

Na consulta anterior ao Codespaces, o backend era `app.pulumi.com`, organização
`riedel-gabriela-org`, projeto `autokeep`. Havia uma stack `dev` vazia e nenhuma
stack `prod` acessível. As tabelas e Lambdas existem na AWS, mas ainda não
estavam registradas no estado Pulumi. Consulte
[o registro Codespaces](../docs/codespaces-validation.md).

O preview de adoção ainda precisa ser executado no Codespaces com as
credenciais AWS e o token Pulumi já disponíveis lá. O checkout local não tem
os CLIs `aws` e `pulumi`; nenhum preview ou import foi executado nesta sessão.

## Procedimento seguro no Codespaces

Instale dependências e confira o TypeScript:

```sh
cd pulumi-start-aws
npm ci
npm run check
pulumi login
```

Para `dev`, selecione a stack vazia existente. Para `prod`, inicialize apenas
o registro de stack no backend Pulumi se ainda não existir. Isso não cria
recursos AWS:

```sh
pulumi stack select dev
pulumi preview --diff
pulumi stack select prod || pulumi stack init prod
pulumi preview --diff
```

Os arquivos YAML versionados fornecem os valores não secretos de cada stack.
Revise cada preview: a adoção segura deve mostrar somente importações dos
recursos existentes e nenhuma criação, atualização, substituição ou remoção de
recursos AWS. Se aparecer qualquer outra operação, pare e investigue. Não rode
`pulumi up`, `pulumi import`, `destroy` ou alteração de configuração da AWS
antes dessa revisão e autorização explícita.

Não copie credenciais para arquivos, logs ou documentação. Não amplie as
permissões IAM só para contornar consultas negadas. Nenhum recurso AWS pago,
mesmo coberto por créditos, deve ser usado sem autorização prévia com o valor
e a frequência informados.

## Recursos esperados

| Stack | DynamoDB | Lambda | Região |
| --- | --- | --- | --- |
| `dev` | `autokeep-dev` | `autokeep-api-dev` | `us-east-1` |
| `prod` | `autokeep-prod` | `autokeep-api-prod` | `us-east-1` |

As roles IAM existentes permanecem fora do gerenciamento deste projeto.
As tabelas usam capacidade provisionada existente de 5 RCU/5 WCU, TTL `ttl`,
sem PITR e chave AWS-owned. A Lambda existente usa Node.js 24.x, handler
`index.handler`, 256 MB, timeout 15 s e armazenamento temporário de 512 MB.
